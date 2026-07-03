import { NextResponse } from "next/server";

interface PlaylistTrack {
  id: string;
  name: string;
  artist: string;
}

interface AgentEditPlan {
  explanation: string;
  remove_track_ids: string[];
  add_prompt: string | null;
  add_count: number;
}

function sanitizePlan(
  value: Partial<AgentEditPlan>,
  trackIds: Set<string>
): AgentEditPlan {
  const removeIds = Array.isArray(value.remove_track_ids)
    ? value.remove_track_ids.filter((id) => trackIds.has(String(id)))
    : [];

  const addPrompt =
    typeof value.add_prompt === "string" && value.add_prompt.trim()
      ? value.add_prompt.trim()
      : null;

  const addCountRaw =
    typeof value.add_count === "number" ? value.add_count : Number(value.add_count);
  const addCount = Number.isFinite(addCountRaw)
    ? Math.min(5, Math.max(1, Math.round(addCountRaw)))
    : 3;

  return {
    explanation:
      typeof value.explanation === "string" && value.explanation.trim()
        ? value.explanation.trim()
        : "Playlist updated.",
    remove_track_ids: Array.from(new Set(removeIds)),
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
  }));

  const response = await fetch(
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
2. Interpret semantics, not just keywords. "Remove all EDM" means remove electronic dance tracks, DJs, festival EDM, etc.
3. If the playlist theme is Hindi, desi, Bollywood, or regional — remove western pop/english tracks that do not fit.
4. If the user wants more songs, set "add_prompt" to a focused curation prompt matching the playlist theme. Set "add_count" between 1 and 5.
5. If the command is only removal/filtering, set "add_prompt" to null.
6. Be aggressive about mismatched tracks when the user complains about accuracy.`,
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
        (track: PlaylistTrack) =>
          track &&
          typeof track.id === "string" &&
          typeof track.name === "string" &&
          typeof track.artist === "string"
      )
      .map((track: PlaylistTrack) => ({
        id: track.id,
        name: track.name,
        artist: track.artist,
      }));

    if (normalizedTracks.length === 0) {
      return NextResponse.json(
        { error: "At least one track is required" },
        { status: 400 }
      );
    }

    const plan = await getPlaylistEditPlan(
      command,
      normalizedTracks,
      playlistContext
    );

    return NextResponse.json(plan);
  } catch (error: unknown) {
    console.error("Playlist agent error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
