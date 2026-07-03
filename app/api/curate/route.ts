import { NextResponse } from "next/server";

// In-memory token caching
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken as string;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
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
    throw new Error(`Spotify authentication failed: ${res.statusText}`);
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

async function getGroqSearchTerms(prompt: string) {
  const groqApiKey = process.env.GROQ_API_KEY;
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
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content: `You are a Spotify curation assistant. Analyze the user prompt and extract:
1. "search_query": a single string optimized for Spotify search API (e.g., genre, mood, instruments, or styles).
2. "exclude_keywords": a list of keywords to filter out (e.g., specific subgenres, mood words, or artists that the user explicitly wants to avoid).
Your response must be in JSON format: { "search_query": "string", "exclude_keywords": ["string"] }. Do not include any other text, conversational elements, or explanation.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    if (!res.ok) {
      throw new Error(`Groq API returned ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);
    
    if (typeof parsed.search_query === "string" && Array.isArray(parsed.exclude_keywords)) {
      return {
        search_query: parsed.search_query,
        exclude_keywords: parsed.exclude_keywords
      };
    }
    throw new Error("Invalid JSON structure returned from Groq API");
  } catch (err) {
    console.error("Groq integration failed, triggering fallback:", err);
    // Fallback rule from architecture.md and edge_cases.md:
    // If Groq fails, fallback to: search_query: prompt.substring(0, 20), exclude_keywords: []
    // If prompt is empty or short, fallback to "lofi chill"
    const fallbackQuery = prompt ? prompt.substring(0, 20).trim() : "lofi chill";
    return {
      search_query: fallbackQuery || "lofi chill",
      exclude_keywords: []
    };
  }
}

async function searchSpotify(searchQuery: string, token: string) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=20`;
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

    // 1. Get query & exclusion parameters using Groq
    const { search_query, exclude_keywords } = await getGroqSearchTerms(prompt);

    // 2. Fetch Spotify token & perform search
    let token = await getSpotifyToken();
    let searchResult;
    try {
      searchResult = await searchSpotify(search_query, token);
    } catch (err: any) {
      if (err.message.includes("expired or invalid")) {
        // Force refresh cached token and retry once
        cachedToken = null;
        token = await getSpotifyToken();
        searchResult = await searchSpotify(search_query, token);
      } else {
        throw err;
      }
    }

    const items = searchResult.tracks?.items || [];

    // Helper mapper to return standardized track structure: { id, name, artist, url, imageUrl }
    const mapTrack = (track: any) => ({
      id: track.id,
      name: track.name,
      artist: track.artists?.[0]?.name || "Unknown Artist",
      url: track.external_urls?.spotify || "",
      imageUrl: track.album?.images?.[0]?.url || ""
    });

    // 3. Filter tracks based on case-insensitive exclusion list
    const filteredTracks = items.filter((track: any) => {
      const trackName = (track.name || "").toLowerCase();
      const artistName = (track.artists?.[0]?.name || "").toLowerCase();

      return !exclude_keywords.some((keyword: string) => {
        const cleanKw = keyword.trim().toLowerCase();
        if (!cleanKw) return false;
        return trackName.includes(cleanKw) || artistName.includes(cleanKw);
      });
    });

    // 4. Handle over-filtering edge case: if 0 tracks survived, return top 3 unfiltered
    if (filteredTracks.length === 0) {
      const top3Unfiltered = items.slice(0, 3).map(mapTrack);
      return NextResponse.json({
        tracks: top3Unfiltered,
        warning: true,
        searchQuery: search_query,
        excludeKeywords: exclude_keywords
      });
    }

    // Otherwise, return top 5 surviving tracks
    const top5Surviving = filteredTracks.slice(0, 5).map(mapTrack);
    return NextResponse.json({
      tracks: top5Surviving,
      warning: false,
      searchQuery: search_query,
      excludeKeywords: exclude_keywords
    });

  } catch (error: any) {
    console.error("API Curate handler error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
