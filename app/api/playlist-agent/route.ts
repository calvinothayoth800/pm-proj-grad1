import { NextResponse } from "next/server";
import { classifyTracksWithGroq, fetchWithRetry } from "../../../lib/curation-engine";

interface PlaylistTrack {
  id: string;
  name: string;
  artist: string;
  artist_genres?: string[];
}

interface AgentEditPlan {
  explanation: string;
  remove_track_ids: string[];
  add_prompt: string | null;
  add_count: number;
}

export function sanitizePlan(
  value: Partial<AgentEditPlan>,
  trackIds: Set<string>
): AgentEditPlan {
  let removeIds = Array.isArray(value.remove_track_ids)
    ? Array.from(new Set(value.remove_track_ids.filter((id) => trackIds.has(String(id)))))
    : [];

  if (removeIds.length === trackIds.size && trackIds.size > 0) {
    const maxToRemove = Math.floor(trackIds.size * 0.8);
    removeIds = removeIds.slice(0, maxToRemove);
  }

  const addPrompt =
    typeof value.add_prompt === "string" && value.add_prompt.trim()
      ? value.add_prompt.trim()
      : null;

  const addCountRaw =
    typeof value.add_count === "number" ? value.add_count : Number(value.add_count);
  const addCount = Number.isFinite(addCountRaw)
    ? Math.min(10, Math.max(1, Math.round(addCountRaw)))
    : 3;

  return {
    explanation:
      typeof value.explanation === "string" && value.explanation.trim()
        ? value.explanation.trim()
        : "Playlist updated.",
    remove_track_ids: removeIds,
    add_prompt: addPrompt,
    add_count: addCount,
  };
}

async function getPlaylistEditPlan(
  command: string,
  tracks: PlaylistTrack[],
  playlistContext: string
): Promise<AgentEditPlan> {
  const groqApiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!groqApiKey) {
    throw new Error("Missing Groq API Key in environment variables");
  }

  const trackIds = new Set(tracks.map((track) => track.id));
  const trackList = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artist,
    genres: track.artist_genres || [],
  }));

  const response = await fetchWithRetry(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You are a playlist editing agent inside a Spotify curation app. The user gives a natural-language command to modify their current playlist.

Return ONLY valid JSON:
{
  "explanation": "short summary of what you did",
  "remove_track_ids": ["id"],
  "add_prompt": "string or null",
  "add_count": 3
}

Rules:
1. "remove_track_ids" MUST only contain IDs from the provided track list.
2. Every track in "Current tracks" has a "genres" array. Use this "genres" array to accurately filter tracks:
   - "remove non-lofi" / "keep only lofi" / "remove non-study": remove any track whose genres do NOT contain "lo-fi", "lofi", "chillhop", "beats", "jazz hop", "study", or "ambient".
   - "remove rap" / "remove vocals" / "instrumental only" / "no singing": remove tracks with genres containing "rap", "hip hop" (unless it's specifically "lo-fi hip hop" or "chillhop" without vocals), "vocal", "pop", "r&b", "soul", or if the track/artist name indicates a vocal feature (e.g. "feat.", "featuring", "ft.").
   - "remove EDM": remove electronic dance, house, techno, club, trance, etc.
   - "remove pop": remove pop, dance pop, synth-pop, mainstream pop, etc.
3. Be extremely precise. If a track is a collaboration or has a featured artist with non-matching genres (e.g. rap or pop), remove it.
4. If the playlist theme is Hindi, desi, Bollywood, or regional — remove western pop/english tracks that do not fit.
5. If the user wants more songs, set "add_prompt" to a focused curation prompt matching the user's specific request (e.g. if they ask to add a rap song, the prompt MUST contain "rap song" or "hip-hop"; if they ask for lofi, it must contain "lofi"). Only default to matching the playlist theme if no specific genre, style, artist, or song is mentioned in their addition request. Set "add_count" between 1 and 10. If the user asks to add songs or fill/expand the playlist, set "add_count" to the number of tracks needed to bring the playlist to at least 5 to 10 tracks, or the number requested by the user.
6. If the command is only removal/filtering, set "add_prompt" to null and "add_count" to 0.
7. DO NOT remove tracks unless the user explicitly asks to remove, filter, clean, or reduce tracks. If the user only asks to add tracks, "remove_track_ids" MUST be empty.
8. DO NOT add tracks unless the user explicitly asks to add, generate, or expand. If the user only asks to remove or filter, "add_prompt" MUST be null and "add_count" MUST be 0.`,
          },
          {
            role: "user",
            content: `Playlist context: ${playlistContext || "Custom curated playlist"}

Current tracks:
${JSON.stringify(trackList, null, 2)}

User command: ${command}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Groq API returned ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  return sanitizePlan(JSON.parse(content), trackIds);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const command = typeof body.command === "string" ? body.command.trim() : "";
    const playlistContext =
      typeof body.playlistContext === "string" ? body.playlistContext : "";
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];

    if (!command) {
      return NextResponse.json({ error: "Command is required" }, { status: 400 });
    }

    const normalizedTracks: PlaylistTrack[] = tracks
      .filter(
        (track: any) =>
          track &&
          typeof track.id === "string" &&
          typeof track.name === "string" &&
          typeof track.artist === "string"
      )
      .map((track: any) => ({
        id: track.id,
        name: track.name,
        artist: track.artist,
        artist_genres: Array.isArray(track.artist_genres) ? track.artist_genres : [],
      }));

    if (normalizedTracks.length === 0) {
      return NextResponse.json(
        { error: "At least one track is required" },
        { status: 400 }
      );
    }

    // Fetch missing genres dynamically via Groq classifier
    const tracksNeedGenres = normalizedTracks.filter(t => !t.artist_genres || t.artist_genres.length === 0);
    if (tracksNeedGenres.length > 0) {
      try {
        const mockMappedTracks = tracksNeedGenres.map(t => ({
          id: t.id,
          name: t.name,
          artist: t.artist,
          artist_ids: [],
          url: "",
          imageUrl: "",
          previewUrl: "",
          popularity: 0,
          artist_genres: []
        }));
        const classified = await classifyTracksWithGroq(mockMappedTracks);
        const classifiedMap = new Map(classified.map(t => [t.id, t.artist_genres]));
        
        for (const track of normalizedTracks) {
          if (!track.artist_genres || track.artist_genres.length === 0) {
            track.artist_genres = classifiedMap.get(track.id) || [];
          }
        }
      } catch (err) {
        console.error("Failed to dynamically classify missing playlist genres:", err);
      }
    }

    const plan = await getPlaylistEditPlan(
      command,
      normalizedTracks,
      playlistContext
    );

    // Apply deterministic hybrid semantic/genre filter to catch anything the LLM misses
    const commandLower = command.toLowerCase();
    const isLofiRefine = /(remove non[ -]?lo[ -]?fi|keep only lo[ -]?fi|only lo[ -]?fi|remove non[ -]study|remove non[ -]chill)/.test(commandLower);
    const isRapRemove = /(remove rap|no rap|instrumental only|only instrumental|remove vocals|no vocals|no singing)/.test(commandLower);
    const isPopRemove = /(remove pop|no pop)/.test(commandLower);
    const isEdmRemove = /(remove edm|no edm|remove electronic)/.test(commandLower);

    const extraRemoveIds = new Set<string>();
    const protectedIds = new Set<string>();

    for (const track of normalizedTracks) {
      const genres = (track.artist_genres || []).map(g => g.toLowerCase());
      const trackNameLower = track.name.toLowerCase();
      const artistLower = track.artist.toLowerCase();

      const hasLofiGenre = genres.some(g => 
        g.includes("lo-fi") || 
        g.includes("lofi") || 
        g.includes("chillhop") || 
        g.includes("beats") || 
        g.includes("jazz hop") || 
        g.includes("jazzhop") || 
        g.includes("study") || 
        g.includes("ambient")
      );
      const hasRapGenre = genres.some(g => g.includes("rap"));
      const hasVocalGenre = genres.some(g => g.includes("vocal") || g.includes("singing") || g.includes("singer"));
      const hasPopGenre = genres.some(g => g.includes("pop") || g.includes("r&b") || g.includes("r-n-b") || g.includes("indie pop"));
      const hasEdmGenre = genres.some(g => g.includes("edm") || g.includes("house") || g.includes("techno") || g.includes("club") || g.includes("trance") || g.includes("dance") || g.includes("electronic"));
      const hasFeature = trackNameLower.includes("feat.") || trackNameLower.includes("featuring") || trackNameLower.includes("ft.") || artistLower.includes("feat.") || artistLower.includes("featuring") || artistLower.includes("ft.");

      // 1. Keep only lofi
      if (isLofiRefine) {
        if (!hasLofiGenre || hasRapGenre) {
          extraRemoveIds.add(track.id);
        } else {
          protectedIds.add(track.id);
        }
      }

      // 2. Remove rap / vocals / features
      if (isRapRemove) {
        const isTrueLofiBeats = (hasLofiGenre || genres.some(g => g.includes("chill"))) && !hasRapGenre;
        if ((hasRapGenre && !isTrueLofiBeats) || hasFeature || hasVocalGenre) {
          extraRemoveIds.add(track.id);
        } else {
          protectedIds.add(track.id);
        }
      }

      // 3. Remove Pop
      if (isPopRemove) {
        if (hasPopGenre) {
          extraRemoveIds.add(track.id);
        } else {
          protectedIds.add(track.id);
        }
      }

      // 4. Remove EDM
      if (isEdmRemove) {
        if (hasEdmGenre) {
          extraRemoveIds.add(track.id);
        } else {
          protectedIds.add(track.id);
        }
      }
    }

    const baseRemoves = new Set(plan.remove_track_ids || []);
    
    // Add extra removals
    for (const id of extraRemoveIds) {
      baseRemoves.add(id);
    }
    
    // Remove protected tracks from deletion list
    for (const id of protectedIds) {
      baseRemoves.delete(id);
    }

    const finalRemovesArray = Array.from(baseRemoves);
    const maxDeletions = Math.max(0, Math.floor(normalizedTracks.length * 0.8));
    plan.remove_track_ids = finalRemovesArray.slice(0, maxDeletions);

    // Enforce addition code guard: if purely additive command, empty all removals!
    const isRemovalQuery = /(remove|delete|clean|no|only|strip|keep|refine|filter|purge)/i.test(command);
    const isAdditionQuery = /(add|fill|expand|introduce|more|insert)/i.test(command);

    if (isAdditionQuery && !isRemovalQuery) {
      plan.remove_track_ids = [];
      plan.explanation = `Adding ${plan.add_count || 1} song(s) matching "${plan.add_prompt || command}".`;
    }

    return NextResponse.json(plan);
  } catch (error: unknown) {
    console.error("Playlist agent error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
