import { NextResponse } from "next/server";
import {
  MappedTrack,
  CurationFeedback,
  getGroqCurationAgent,
  sanitizeKeywords,
  getRegionalExcludes,
  getLofiExcludes,
  getSpotifyToken,
  fetchSpotifyRecommendations,
  searchSpotifySemantic,
  classifyTracksWithGroq,
  dedupeTracks,
  shuffleItems,
  enrichTracksWithSpotifyPreviews,
  chooseTopTracks,
  mapTrack,
  injectArtistGenres,
} from "../../../lib/curation-engine";

export async function POST(req: Request) {
  try {
    const { prompt, feedback, limit, existingTrackIds } = await req.json();
    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const cleanPrompt = prompt.trim();
    const feedbackContext: CurationFeedback | undefined =
      feedback && typeof feedback === "object"
        ? {
            likedArtists: Array.isArray(feedback.likedArtists)
              ? feedback.likedArtists
              : [],
            dislikedArtists: Array.isArray(feedback.dislikedArtists)
              ? feedback.dislikedArtists
              : [],
            dislikedTrackIds: Array.isArray(feedback.dislikedTrackIds)
              ? feedback.dislikedTrackIds
              : [],
          }
        : undefined;

    const agentConfig = await getGroqCurationAgent(cleanPrompt, feedbackContext);
    agentConfig.exclude_keywords = sanitizeKeywords([
      ...agentConfig.exclude_keywords,
      ...getRegionalExcludes(cleanPrompt),
      ...getLofiExcludes(cleanPrompt),
    ]);

    const promptLower = cleanPrompt.toLowerCase();
    if (promptLower.includes("rap") || promptLower.includes("hiphop") || promptLower.includes("hip-hop")) {
      agentConfig.exclude_keywords = agentConfig.exclude_keywords.filter(
        k => !["rap", "hip hop", "hiphop"].includes(k.toLowerCase())
      );
    }
    if (promptLower.includes("vocal") || promptLower.includes("sing") || promptLower.includes("song")) {
      agentConfig.exclude_keywords = agentConfig.exclude_keywords.filter(
        k => !["vocal", "vocals", "singing", "singer"].includes(k.toLowerCase())
      );
    }
    if (promptLower.includes("pop")) {
      agentConfig.exclude_keywords = agentConfig.exclude_keywords.filter(
        k => !["pop"].includes(k.toLowerCase())
      );
    }
    if (promptLower.includes("edm") || promptLower.includes("electronic") || promptLower.includes("house") || promptLower.includes("techno")) {
      agentConfig.exclude_keywords = agentConfig.exclude_keywords.filter(
        k => !["edm", "electronic", "house", "techno", "dance"].includes(k.toLowerCase())
      );
    }
    const token = await getSpotifyToken();

    const preferredCount =
      typeof limit === "number"
        ? Math.min(10, Math.max(1, limit))
        : typeof agentConfig.track_count === "number"
        ? Math.min(10, Math.max(1, agentConfig.track_count))
        : 5;

    let source: "recommendations" | "semantic_search" = "semantic_search";
    let warning = false;
    let tracks: MappedTrack[] = [];

    try {
      tracks = await fetchSpotifyRecommendations(agentConfig, token);
      source = "recommendations";
    } catch (error) {
      console.error(
        "Recommendations unavailable; using semantic artist search:",
        error
      );
      source = "semantic_search";
      warning = true;
      tracks = await searchSpotifySemantic(agentConfig, token, cleanPrompt);
    }

    if (tracks.length === 0) {
      source = "semantic_search";
      warning = true;
      tracks = await searchSpotifySemantic(agentConfig, token, cleanPrompt);
    }

    const parsedExistingIds = Array.isArray(existingTrackIds)
      ? new Set<string>(existingTrackIds.map(String))
      : new Set<string>();

    let uniqueTracks = dedupeTracks(tracks).filter(
      (track) => !feedbackContext?.dislikedTrackIds?.includes(track.id) && !parsedExistingIds.has(track.id)
    );

    // Limit candidates to top 15 for classification to avoid token limits
    const tracksToClassify = uniqueTracks.slice(0, 15);
    const resolvedTracks = await injectArtistGenres(tracksToClassify, token);
    const classifiedTracks = await classifyTracksWithGroq(resolvedTracks);

    const shuffledClassified = shuffleItems(classifiedTracks);
    let enrichedTracks = await enrichTracksWithSpotifyPreviews(shuffledClassified);
    let chosen = chooseTopTracks(
      enrichedTracks,
      agentConfig.exclude_keywords,
      cleanPrompt,
      preferredCount
    );

    let playableCount = chosen.tracks.filter((track) => track.previewUrl).length;
    const isLofiPrompt = /(lo[ -]?fi|chill|study|sleep|ambient|coding|work|relax)/i.test(cleanPrompt);

    // 1. First backfill: Try semantic search if we are short on tracks or playable previews
    if (chosen.tracks.length < preferredCount || playableCount < Math.min(3, preferredCount)) {
      let extraTracks = await searchSpotifySemantic(
        {
          ...agentConfig,
          seed_genres: isLofiPrompt ? "lo-fi,chillhop,ambient" : agentConfig.seed_genres,
        },
        token,
        cleanPrompt || (isLofiPrompt ? "lofi study beats" : "")
      );
      const uniqueExtra = dedupeTracks(extraTracks).filter((t) => !parsedExistingIds.has(t.id));
      const tracksToClassifyExtra = uniqueExtra.slice(0, 15);
      const resolvedExtra = await injectArtistGenres(tracksToClassifyExtra, token);
      const classifiedExtra = await classifyTracksWithGroq(resolvedExtra);

      const merged = dedupeTracks([...enrichedTracks, ...classifiedExtra]);
      enrichedTracks = await enrichTracksWithSpotifyPreviews(merged);
      chosen = chooseTopTracks(
        enrichedTracks,
        agentConfig.exclude_keywords,
        cleanPrompt,
        preferredCount
      );
      playableCount = chosen.tracks.filter((track) => track.previewUrl).length;
    }

    // 2. Second fail-safe backfill: Use static verified lofi tracks if it's a lofi prompt and we're still short
    if (isLofiPrompt && chosen.tracks.length < preferredCount) {
      const STATIC_LOFI_FILLERS = [
        { name: "Quiet", artist: "Jinsang" },
        { name: "Attached", artist: "Kudasaibeats" },
        { name: "in your arms", artist: "Saib" },
        { name: "ikigai", artist: "Idealism" },
        { name: "Herewego", artist: "Jinsang" },
        { name: "dream of her", artist: "Kudasaibeats" },
        { name: "Daydreaming", artist: "Saib" },
        { name: "phat pug", artist: "Idealism" },
        { name: "Affection", artist: "Jinsang" },
        { name: "Smile from U", artist: "Saib" },
        { name: "Spike Spiegel", artist: "Saib" },
        { name: "controlla", artist: "Idealism" },
        { name: "Both of Us", artist: "Idealism" },
        { name: "Snow & Sand", artist: "Local Forecast" },
        { name: "Vibe", artist: "Jinsang" },
        { name: "Warm", artist: "Kudasaibeats" },
        { name: "Riding Bicycle", artist: "Saib" },
        { name: "Genesis", artist: "Jinsang" },
        { name: "Snowfall", artist: "Idealism" },
        { name: "Lullaby", artist: "Kudasaibeats" },
        { name: "Summer Breeze", artist: "Saib" },
        { name: "Journey", artist: "Jinsang" },
        { name: "Phantasia", artist: "Idealism" },
        { name: "Solitude", artist: "Kudasaibeats" },
        { name: "Sunset", artist: "Saib" },
        { name: "Smile", artist: "Jinsang" },
        { name: "Aria", artist: "Idealism" },
        { name: "Night Owl", artist: "Kudasaibeats" },
        { name: "Elevate", artist: "Saib" },
        { name: "Midnight", artist: "Jinsang" },
        { name: "Reminiscing", artist: "Idealism" },
        { name: "Lost", artist: "Kudasaibeats" },
        { name: "Shanghai Nights", artist: "Saib" },
        { name: "Glow", artist: "Jinsang" },
        { name: "Another Time", artist: "Idealism" },
        { name: "Whisper", artist: "Kudasaibeats" },
        { name: "Around the Block", artist: "Saib" }
      ];

      const needed = preferredCount - chosen.tracks.length;
      const resolved: MappedTrack[] = [];
      const shuffledBackfills = shuffleItems(STATIC_LOFI_FILLERS);
      
      for (const item of shuffledBackfills) {
        if (resolved.length >= needed) break;
        
        try {
          const params = new URLSearchParams({
            q: `track:"${item.name}" artist:"${item.artist}"`,
            type: "track",
            limit: "1",
            market: "US",
          });
          const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) continue;
          const data = await res.json();
          const rawTrack = data.tracks?.items?.[0];
          if (rawTrack) {
            const mapped = mapTrack(rawTrack);
            if (mapped && !parsedExistingIds.has(mapped.id)) {
              resolved.push(mapped);
            }
          }
        } catch (err) {
          console.error("Backfill track resolve error:", err);
        }
      }
        
      if (resolved.length > 0) {
        const resolvedWithGenres = await injectArtistGenres(resolved, token);
        const classifiedBackfill = await classifyTracksWithGroq(resolvedWithGenres);
        const enrichedBackfill = await enrichTracksWithSpotifyPreviews(classifiedBackfill);
        const merged = dedupeTracks([...enrichedTracks, ...enrichedBackfill]);
        enrichedTracks = merged;
        chosen = chooseTopTracks(
          enrichedTracks,
          agentConfig.exclude_keywords,
          cleanPrompt,
          preferredCount
        );
      }
    }

    // 3. Third final backfill: If still short for any reason, run search without exclusions to guarantee matches
    if (chosen.tracks.length < preferredCount) {
      let finalExtra = await searchSpotifySemantic(
        {
          ...agentConfig,
          exclude_keywords: [],
        },
        token,
        cleanPrompt
      );
      const uniqueFinal = dedupeTracks(finalExtra).filter((t) => !parsedExistingIds.has(t.id));
      const tracksToClassifyFinal = uniqueFinal.slice(0, 15);
      const resolvedFinal = await injectArtistGenres(tracksToClassifyFinal, token);
      const classifiedFinal = await classifyTracksWithGroq(resolvedFinal);

      const merged = dedupeTracks([...enrichedTracks, ...classifiedFinal]);
      enrichedTracks = await enrichTracksWithSpotifyPreviews(merged);
      chosen = chooseTopTracks(
        enrichedTracks,
        agentConfig.exclude_keywords,
        cleanPrompt,
        preferredCount
      );
    }

    return NextResponse.json({
      tracks: chosen.tracks,
      warning: warning || chosen.warning,
      source,
      agent: agentConfig,
      excludeKeywords: agentConfig.exclude_keywords,
      fallbackTier: chosen.fallbackTier,
    });
  } catch (error: unknown) {
    console.error("API Curate handler error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
