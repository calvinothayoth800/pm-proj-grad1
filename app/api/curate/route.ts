import { NextResponse } from "next/server";

const ALLOWED_GENRES = [
  "acoustic",
  "afrobeat",
  "alt-rock",
  "ambient",
  "anime",
  "black-metal",
  "bluegrass",
  "blues",
  "bossanova",
  "chill",
  "classical",
  "club",
  "country",
  "dance",
  "disco",
  "edm",
  "electronic",
  "emo",
  "folk",
  "funk",
  "gospel",
  "goth",
  "grunge",
  "hip-hop",
  "house",
  "indie",
  "j-pop",
  "jazz",
  "k-pop",
  "metal",
  "pop",
  "punk",
  "r-n-b",
  "rock",
  "romance",
  "sad",
  "soul",
  "synth-pop",
  "techno",
  "trance",
] as const;

const ALLOWED_GENRE_SET = new Set<string>(ALLOWED_GENRES);
const DEFAULT_AGENT_OUTPUT: AgentOutput = {
  seed_genres: "chill,pop",
  target_energy: 0.5,
  target_valence: 0.5,
  target_danceability: 0.5,
  exclude_keywords: [],
};

const FILLER_ARTIST_KEYWORDS = [
  "ambience",
  "background",
  "binaural",
  "binaural beats",
  "calm focus",
  "concentration music",
  "edm music",
  "frequency generators",
  "lofi generator",
  "meditation",
  "music for sleep",
  "nature sounds",
  "rain sounds",
  "relaxation",
  "relaxing",
  "sleep",
  "sleeping music",
  "soundscape",
  "study aid",
  "study beats",
  "white noise",
];

const FALLBACK_REFERENCE_ARTISTS: Record<string, string[]> = {
  acoustic: ["Hozier", "Norah Jones", "Iron & Wine"],
  chill: ["Khalid", "Frank Ocean", "Daniel Caesar"],
  club: ["Calvin Harris", "David Guetta", "Disclosure"],
  dance: ["Dua Lipa", "Calvin Harris", "David Guetta"],
  edm: ["Calvin Harris", "Avicii", "Zedd"],
  electronic: ["Disclosure", "Flume", "Rufus Du Sol"],
  folk: ["Noah Kahan", "Mumford & Sons", "Iron & Wine"],
  funk: ["Anderson .Paak", "Steve Lacy", "Thundercat"],
  house: ["Disclosure", "Calvin Harris", "Fred again.."],
  "hip-hop": ["Kendrick Lamar", "J. Cole", "Tyler, The Creator"],
  indie: ["The xx", "Bon Iver", "Phoebe Bridgers"],
  jazz: ["Robert Glasper", "Norah Jones", "Chet Baker"],
  pop: ["The Weeknd", "SZA", "Dua Lipa"],
  "r-n-b": ["Daniel Caesar", "Giveon", "SZA", "Frank Ocean"],
  romance: ["Daniel Caesar", "Giveon", "Snoh Aalegra"],
  soul: ["Leon Bridges", "Snoh Aalegra", "Daniel Caesar"],
  techno: ["Charlotte de Witte", "Amelie Lens", "Adam Beyer"],
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

interface AgentOutput {
  seed_genres: string;
  target_energy: number;
  target_valence: number;
  target_danceability: number;
  exclude_keywords: string[];
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  external_urls?: { spotify?: string };
  album?: { images?: Array<{ url?: string }> };
  preview_url?: string | null;
  popularity?: number;
}

interface MappedTrack {
  id: string;
  name: string;
  artist: string;
  url: string;
  imageUrl: string;
  previewUrl: string;
  popularity: number;
}

function clamp01(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function sanitizeKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((keyword) => String(keyword).trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function sanitizeAgentOutput(value: Partial<AgentOutput>): AgentOutput {
  const rawSeedGenres =
    typeof value.seed_genres === "string"
      ? value.seed_genres
      : DEFAULT_AGENT_OUTPUT.seed_genres;

  const seedGenres = rawSeedGenres
    .split(",")
    .map((genre) => genre.trim().toLowerCase())
    .filter((genre) => ALLOWED_GENRE_SET.has(genre))
    .slice(0, 3);

  return {
    seed_genres:
      seedGenres.length > 0
        ? seedGenres.join(",")
        : DEFAULT_AGENT_OUTPUT.seed_genres,
    target_energy: clamp01(
      value.target_energy,
      DEFAULT_AGENT_OUTPUT.target_energy
    ),
    target_valence: clamp01(
      value.target_valence,
      DEFAULT_AGENT_OUTPUT.target_valence
    ),
    target_danceability: clamp01(
      value.target_danceability,
      DEFAULT_AGENT_OUTPUT.target_danceability
    ),
    exclude_keywords: sanitizeKeywords(value.exclude_keywords),
  };
}

function mapTrack(track: SpotifyTrack): MappedTrack | null {
  if (!track.id) return null;

  return {
    id: track.id,
    name: track.name || "Unknown Track",
    artist: track.artists?.[0]?.name || "Unknown Artist",
    url: track.external_urls?.spotify || "",
    imageUrl: track.album?.images?.[0]?.url || "",
    previewUrl:
      track.preview_url ||
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    popularity: track.popularity || 0,
  };
}

function dedupeTracks(tracks: MappedTrack[]) {
  const seenIds = new Set<string>();
  const uniqueTracks: MappedTrack[] = [];

  for (const track of tracks) {
    if (!seenIds.has(track.id)) {
      seenIds.add(track.id);
      uniqueTracks.push(track);
    }
  }

  return uniqueTracks;
}

function filterTracks(tracks: MappedTrack[], excludeKeywords: string[]) {
  return tracks.filter((track) => {
    const haystack = `${track.name} ${track.artist}`.toLowerCase();

    const matchesExclusion = excludeKeywords.some((keyword) => {
      const cleanKeyword = keyword.trim().toLowerCase();
      return cleanKeyword && haystack.includes(cleanKeyword);
    });
    if (matchesExclusion) return false;

    const isFillerArtist = FILLER_ARTIST_KEYWORDS.some((keyword) =>
      track.artist.toLowerCase().includes(keyword)
    );

    return !isFillerArtist;
  });
}

function chooseTopTracks(
  tracks: MappedTrack[],
  excludeKeywords: string[],
  preferredCount = 5
) {
  const filteredTracks = filterTracks(tracks, excludeKeywords);

  if (filteredTracks.length === 0 && tracks.length > 0) {
    return {
      tracks: tracks.slice(0, 3),
      warning: true,
    };
  }

  const sortedTracks = [...filteredTracks].sort(
    (a, b) => b.popularity - a.popularity
  );

  return {
    tracks: sortedTracks.slice(0, preferredCount),
    warning: sortedTracks.length < 3,
  };
}

function genreToSearchTerm(genre: string) {
  const genreMap: Record<string, string> = {
    "hip-hop": "hip hop",
    "r-n-b": "r&b",
    "synth-pop": "synth pop",
  };

  return genreMap[genre] || genre;
}

function getPositivePromptSlice(prompt: string) {
  return prompt
    .split(/\b(?:no|not|without|exclude|avoid|absolutely no)\b/i)[0]
    .replace(/[^\w\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackQueries(prompt: string, agentConfig: AgentOutput) {
  const seedGenres = agentConfig.seed_genres
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
  const seedTerms = seedGenres.map(genreToSearchTerm);
  const referenceArtists = seedGenres.flatMap(
    (genre) => FALLBACK_REFERENCE_ARTISTS[genre] || []
  );
  const positivePrompt = getPositivePromptSlice(prompt);
  const queries = new Set<string>();

  for (const artist of referenceArtists.slice(0, 4)) {
    queries.add(artist);
  }

  const primaryGenre = seedTerms[0] || "chill";
  if (agentConfig.target_energy <= 0.45) {
    queries.add(`late night ${primaryGenre}`);
  }
  if (
    agentConfig.seed_genres.includes("romance") ||
    positivePrompt.toLowerCase().includes("romantic")
  ) {
    queries.add(`romantic ${primaryGenre}`);
  }
  if (agentConfig.target_valence <= 0.45) {
    queries.add(`moody ${primaryGenre}`);
  }
  if (seedTerms.length > 0) queries.add(seedTerms.join(" "));
  if (positivePrompt) queries.add(positivePrompt);

  return Array.from(queries).slice(0, 7);
}

async function getSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = (process.env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify credentials in environment variables");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Spotify authentication failed: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Spotify did not return an access token");
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + Math.max(0, data.expires_in - 60) * 1000;
  return cachedToken;
}

async function getGroqCurationAgent(prompt: string): Promise<AgentOutput> {
  const groqApiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!groqApiKey) {
    throw new Error("Missing Groq API Key in environment variables");
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            content: `You are a music API translation agent. Translate the user's emotional prompt into strict Spotify Audio Features. You MUST return ONLY a valid JSON object.

Return this schema exactly:
{
  "seed_genres": "comma-separated string of 1 to 3 genres",
  "target_energy": 0.0,
  "target_valence": 0.0,
  "target_danceability": 0.0,
  "exclude_keywords": ["string"]
}

Rules:
1. "seed_genres" MUST contain exactly 1 to 3 genres. ONLY pick from this allowed list, never invent genres: [${ALLOWED_GENRES.join(", ")}].
2. "target_energy" is a float from 0.0 calm to 1.0 intense.
3. "target_valence" is a float from 0.0 depressed/dark to 1.0 euphoric/bright.
4. "target_danceability" is a float from 0.0 ambient/freeform to 1.0 club/groove.
5. "exclude_keywords" must include artists, sub-genres, production styles, or words the user says or implies they do NOT want.
6. Infer semantics. Do not hardcode examples. For late-night romantic melodic prompts, generally prefer lower energy, moderate danceability, warmer intimate genres like r-n-b, soul, romance, chill, or acoustic. If the user says not synthy, avoid synth-pop/electronic/edm/techno seeds and add synth-related exclude keywords.
7. Prefer vocal, recognizable songs unless the prompt explicitly asks for instrumental/background music.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API returned ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return sanitizeAgentOutput(JSON.parse(content));
  } catch (error) {
    console.error("Groq semantic parser failed; using fallback:", error);
    return DEFAULT_AGENT_OUTPUT;
  }
}

async function fetchSpotifyRecommendations(
  agentConfig: AgentOutput,
  token: string
) {
  const params = new URLSearchParams({
    limit: "15",
    market: "US",
    seed_genres: agentConfig.seed_genres,
    target_energy: String(agentConfig.target_energy),
    target_valence: String(agentConfig.target_valence),
    target_danceability: String(agentConfig.target_danceability),
  });

  const response = await fetch(
    `https://api.spotify.com/v1/recommendations?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Spotify recommendations failed: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();
  return ((data.tracks || []) as SpotifyTrack[])
    .map(mapTrack)
    .filter((track): track is MappedTrack => Boolean(track));
}

async function searchSpotifyFallback(
  prompt: string,
  agentConfig: AgentOutput,
  token: string
) {
  const queries = buildFallbackQueries(prompt, agentConfig);
  const requests = queries.map(async (query) => {
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: "10",
      market: "US",
    });

    const response = await fetch(
      `https://api.spotify.com/v1/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Spotify fallback search failed for "${query}": ${response.status} ${errorText}`
      );
      return [];
    }

    const data = await response.json();
    return ((data.tracks?.items || []) as SpotifyTrack[])
      .map(mapTrack)
      .filter((track): track is MappedTrack => Boolean(track));
  });

  const results = await Promise.all(requests);
  const interleavedTracks: MappedTrack[] = [];
  const maxResultLength = Math.max(...results.map((tracks) => tracks.length), 0);

  for (let index = 0; index < maxResultLength; index += 1) {
    for (const tracks of results) {
      const track = tracks[index];
      if (track) interleavedTracks.push(track);
    }
  }

  return dedupeTracks(interleavedTracks);
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const cleanPrompt = prompt.trim();
    const agentConfig = await getGroqCurationAgent(cleanPrompt);
    const token = await getSpotifyToken();

    let source: "recommendations" | "search_fallback" = "recommendations";
    let warning = false;
    let tracks: MappedTrack[] = [];

    try {
      tracks = await fetchSpotifyRecommendations(agentConfig, token);
    } catch (error) {
      console.error("Recommendations unavailable; using search fallback:", error);
      source = "search_fallback";
      warning = true;
      tracks = await searchSpotifyFallback(cleanPrompt, agentConfig, token);
    }

    if (tracks.length === 0) {
      source = "search_fallback";
      warning = true;
      tracks = await searchSpotifyFallback(cleanPrompt, agentConfig, token);
    }

    const uniqueTracks = dedupeTracks(tracks);
    const chosen = chooseTopTracks(uniqueTracks, agentConfig.exclude_keywords);

    return NextResponse.json({
      tracks: chosen.tracks,
      warning: warning || chosen.warning,
      source,
      agent: agentConfig,
      excludeKeywords: agentConfig.exclude_keywords,
    });
  } catch (error: unknown) {
    console.error("API Curate handler error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
