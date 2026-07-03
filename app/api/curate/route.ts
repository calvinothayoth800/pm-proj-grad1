import { NextResponse } from "next/server";

// In-memory token caching
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken as string;
  }

  const clientId = (process.env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify credentials in environment variables");
  }

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Spotify auth request failed with body:", errorText);
    throw new Error(`Spotify authentication failed: ${res.statusText} - ${errorText}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No access token returned from Spotify API");
  }
  cachedToken = data.access_token;
  // Expire 1 minute early to be safe
  tokenExpiresAt = now + (data.expires_in - 60) * 1000;
  return cachedToken as string;
}

interface AgentOutput {
  genres: string[];
  artists: string[];
  search_queries: string[];
  exclude_keywords: string[];
}

async function getGroqCurationAgent(prompt: string): Promise<AgentOutput> {
  const groqApiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!groqApiKey) {
    throw new Error("Missing Groq API Key in environment variables");
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            content: `You are an expert Music Curator Agent. Analyze the user prompt representing a musical vibe, mood, or context. Expand this prompt into structured Spotify search criteria to fetch high-quality, recognizable songs by real artists.
Your response must be in JSON format:
{
  "genres": ["list of 2-3 Spotify genres matching the vibe, e.g. 'synthwave', 'indie-folk', 'shoegaze', 'techno'"],
  "artists": ["list of 4-5 real, well-known, high-quality music artists that embody this vibe, e.g. 'The Midnight', 'Bon Iver', 'Kavinsky', 'Depeche Mode'"],
  "search_queries": ["list of 2-3 specific phrases or styles to query, e.g. 'neon cruise', 'ambient dream'"],
  "exclude_keywords": ["list of 3-4 keywords or styles to filter out, e.g. 'karaoke', 'tribute', 'cover', 'relaxing lofi'"]
}
Do not include any other text, conversational elements, or markdown blocks (like \`\`\`json). Just the raw JSON.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!res.ok) {
      throw new Error(`Groq API returned ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);

    return {
      genres: Array.isArray(parsed.genres) ? parsed.genres : [],
      artists: Array.isArray(parsed.artists) ? parsed.artists : [],
      search_queries: Array.isArray(parsed.search_queries) ? parsed.search_queries : [],
      exclude_keywords: Array.isArray(parsed.exclude_keywords) ? parsed.exclude_keywords : []
    };
  } catch (err) {
    console.error("Groq agent curation failed, triggering fallback:", err);
    return {
      genres: [],
      artists: [],
      search_queries: [prompt.substring(0, 20).trim() || "lofi chill"],
      exclude_keywords: []
    };
  }
}

async function searchSpotify(searchQuery: string, token: string) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Spotify token expired or invalid");
    }
    throw new Error(`Spotify search failed: ${res.statusText}`);
  }

  return await res.json();
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // 1. Invoke the Groq Curation Agent to expand the prompt semantically
    const agentConfig = await getGroqCurationAgent(prompt);

    // 2. Fetch Spotify token & execute search queries in parallel
    let token = await getSpotifyToken();
    const searchPromises: Promise<any>[] = [];

    // A. Query standard phrases
    agentConfig.search_queries.forEach((q) => {
      searchPromises.push(
        fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      );
    });

    // B. Query targeted artists
    agentConfig.artists.forEach((artist) => {
      searchPromises.push(
        fetch(`https://api.spotify.com/v1/search?q=artist:%22${encodeURIComponent(artist)}%22&type=track&limit=5`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      );
    });

    // C. Query targeted genres
    agentConfig.genres.forEach((genre) => {
      searchPromises.push(
        fetch(`https://api.spotify.com/v1/search?q=genre:%22${encodeURIComponent(genre)}%22&type=track&limit=5`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      );
    });

    // Wait for all searches to settle
    const results = await Promise.all(searchPromises);

    // Flatten all items
    const allTracks: any[] = [];
    results.forEach((res) => {
      if (res && res.tracks && res.tracks.items) {
        allTracks.push(...res.tracks.items);
      }
    });

    // 3. Deduplicate tracks by Spotify ID
    const seenIds = new Set<string>();
    const uniqueTracks: any[] = [];
    for (const track of allTracks) {
      if (track && track.id && !seenIds.has(track.id)) {
        seenIds.add(track.id);
        uniqueTracks.push(track);
      }
    }

    // Standard mapping helper
    const mapTrack = (track: any) => ({
      id: track.id,
      name: track.name || "Unknown Track",
      artist: track.artists?.[0]?.name || "Unknown Artist",
      url: track.external_urls?.spotify || "",
      imageUrl: track.album?.images?.[0]?.url || "",
      previewUrl: track.preview_url || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      popularity: track.popularity || 0
    });

    // Lists of filler keywords in artist name to prevent generic royalty-free tracks
    const spamArtistsKeywords = [
      "lofi generator", "concentration music", "relaxation", "sleeping music", "relaxing",
      "nature sounds", "background", "study beats", "rain sounds", "binaural beats",
      "white noise", "binaural", "sleep", "meditation", "music for sleep", "soundscape",
      "ambience", "study aid", "calm focus", "binaural beats", "frequency generators"
    ];

    // 4. Perform exclusion filters and spam filtering
    const mappedTracks = uniqueTracks.map(mapTrack);
    const filteredTracks = mappedTracks.filter((track) => {
      const trackNameLower = track.name.toLowerCase();
      const artistLower = track.artist.toLowerCase();

      // A. Check user's exclude_keywords
      const matchesExclusion = agentConfig.exclude_keywords.some((keyword) => {
        const cleanKw = keyword.trim().toLowerCase();
        if (!cleanKw) return false;
        return trackNameLower.includes(cleanKw) || artistLower.includes(cleanKw);
      });
      if (matchesExclusion) return false;

      // B. Check spam artist words to block royalty-free channels
      const isSpamArtist = spamArtistsKeywords.some((word) => artistLower.includes(word));
      if (isSpamArtist) return false;

      return true;
    });

    // 5. Popularity Threshold Filtering (keeps proper songs)
    // Enforce popularity >= 15 to drop filler instrumental tracks
    let highQualityTracks = filteredTracks.filter((t) => t.popularity >= 15);
    let warningTriggered = false;

    if (highQualityTracks.length < 3) {
      // Relax popularity rule slightly
      highQualityTracks = filteredTracks.filter((t) => t.popularity >= 5);
    }
    if (highQualityTracks.length < 3) {
      // Fallback to all filtered tracks
      highQualityTracks = filteredTracks;
      warningTriggered = true;
    }

    // 6. Sort by popularity descending to prioritize famous/proper tracks
    highQualityTracks.sort((a, b) => b.popularity - a.popularity);

    // Slice top 8 tracks for the playlist
    const topTracks = highQualityTracks.slice(0, 8);

    // Fallback if everything is filtered out
    if (topTracks.length === 0) {
      console.warn("Curation agent filtered out all results, running fallback search");
      const fallbackResult = await searchSpotify(prompt.substring(0, 20) || "lofi chill", token);
      const fallbackItems = (fallbackResult.tracks?.items || []).map(mapTrack);
      return NextResponse.json({
        tracks: fallbackItems.slice(0, 5),
        warning: true,
        searchQuery: prompt,
        excludeKeywords: []
      });
    }

    return NextResponse.json({
      tracks: topTracks,
      warning: warningTriggered,
      searchQuery: agentConfig.search_queries.join(", "),
      excludeKeywords: agentConfig.exclude_keywords
    });

  } catch (error: any) {
    console.error("API Curate handler error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
