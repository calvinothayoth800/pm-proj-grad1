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
  seed_artists: ["Frank Ocean", "SZA", "Khalid"],
  target_energy: 0.5,
  target_valence: 0.5,
  target_danceability: 0.5,
  exclude_keywords: [],
};

const FILLER_ARTIST_KEYWORDS = [
  "ambience",
  "auditory music",
  "background",
  "binaural",
  "binaural beats",
  "calm focus",
  "concentration music",
  "decayed souls",
  "edm music",
  "frequency generators",
  "fulton street",
  "hermei",
  "lofi generator",
  "meditation",
  "music for sleep",
  "must save jane",
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
  "ym mora",
  "zock",
];

const FILLER_TITLE_KEYWORDS = [
  "lofi",
  "lo-fi",
  "beats to",
  "study music",
  "sleep music",
  "white noise",
  "binaural",
  "meditation",
  "asmr",
  "soundscape",
  "neon cityscape",
  "neon cityscapes",
  "neon nightscape",
  "neon dreamscape",
  "cityscape",
  "nightscape",
  "dreamscape",
  "edm dance",
  "dance dance",
];

const GENERIC_TITLE_PATTERN =
  /^(edm|dance|soul|chill|acoustic|electronic|folk|techno|house|ambient)(\s+(dance|beats|music|mix))?$/i;

const FALLBACK_REFERENCE_ARTISTS: Record<string, string[]> = {
  acoustic: ["Hozier", "Norah Jones", "Iron & Wine", "Noah Kahan"],
  chill: ["Khalid", "Frank Ocean", "Daniel Caesar", "Snoh Aalegra"],
  club: ["Calvin Harris", "David Guetta", "Disclosure"],
  dance: ["Dua Lipa", "Calvin Harris", "David Guetta", "Fred again.."],
  edm: ["Calvin Harris", "Avicii", "Zedd", "Disclosure"],
  electronic: ["Disclosure", "Flume", "Rufus Du Sol", "Fred again.."],
  folk: ["Noah Kahan", "Mumford & Sons", "Iron & Wine", "Hozier"],
  funk: ["Anderson .Paak", "Steve Lacy", "Thundercat"],
  house: ["Disclosure", "Calvin Harris", "Fred again.."],
  "hip-hop": ["Kendrick Lamar", "J. Cole", "Tyler, The Creator", "Isaiah Rashad"],
  indie: ["The xx", "Bon Iver", "Phoebe Bridgers", "Arctic Monkeys"],
  jazz: ["Robert Glasper", "Norah Jones", "Chet Baker"],
  pop: ["The Weeknd", "SZA", "Dua Lipa", "Taylor Swift"],
  "r-n-b": ["Daniel Caesar", "Giveon", "SZA", "Frank Ocean", "Snoh Aalegra"],
  romance: ["Daniel Caesar", "Giveon", "Snoh Aalegra", "H.E.R."],
  rock: ["Arctic Monkeys", "Foo Fighters", "The Killers"],
  sad: ["Phoebe Bridgers", "Bon Iver", "Lana Del Rey"],
  soul: ["Leon Bridges", "Snoh Aalegra", "Daniel Caesar", "Alicia Keys"],
  "synth-pop": ["The Weeknd", "Kavinsky", "CHVRCHES", "M83", "The Midnight"],
  techno: ["Charlotte de Witte", "Amelie Lens", "Adam Beyer"],
};

const MIN_TRACK_POPULARITY = 15;
const BLOCKED_PREVIEW_HOSTS = ["soundhelix.com"];

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

interface AgentOutput {
  seed_genres: string;
  seed_artists: string[];
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

function sanitizeArtists(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((artist) => String(artist).trim())
        .filter((artist) => artist.length > 1)
    )
  ).slice(0, 6);
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

  const seedArtists = sanitizeArtists(value.seed_artists);

  return {
    seed_genres:
      seedGenres.length > 0
        ? seedGenres.join(",")
        : DEFAULT_AGENT_OUTPUT.seed_genres,
    seed_artists:
      seedArtists.length > 0
        ? seedArtists
        : DEFAULT_AGENT_OUTPUT.seed_artists,
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
    previewUrl: track.preview_url || "",
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

function shuffleItems<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function isValidSpotifyPreviewUrl(url: string) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (BLOCKED_PREVIEW_HOSTS.some((host) => lower.includes(host))) return false;
  return lower.includes("scdn.co/mp3-preview") || lower.includes("spotify.com");
}

function isKeywordStuffedTitle(title: string, prompt: string) {
  const promptWords = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3);
  if (promptWords.length === 0) return false;

  const titleLower = title.toLowerCase();
  const matchedWords = promptWords.filter((word) => titleLower.includes(word));
  return matchedWords.length >= 2;
}

function filterTracks(
  tracks: MappedTrack[],
  excludeKeywords: string[],
  prompt = ""
) {
  return tracks.filter((track) => {
    const haystack = `${track.name} ${track.artist}`.toLowerCase();

    const matchesExclusion = excludeKeywords.some((keyword) => {
      const cleanKeyword = keyword.trim().toLowerCase();
      return cleanKeyword && haystack.includes(cleanKeyword);
    });
    if (matchesExclusion) return false;

    const artistLower = track.artist.toLowerCase();
    const titleLower = track.name.toLowerCase();

    const isFillerArtist = FILLER_ARTIST_KEYWORDS.some((keyword) =>
      artistLower.includes(keyword)
    );
    if (isFillerArtist) return false;

    const isFillerTitle = FILLER_TITLE_KEYWORDS.some((keyword) =>
      titleLower.includes(keyword)
    );
    if (isFillerTitle) return false;

    if (GENERIC_TITLE_PATTERN.test(track.name.trim())) return false;

    if (prompt && isKeywordStuffedTitle(track.name, prompt)) return false;

    if (track.popularity < MIN_TRACK_POPULARITY) return false;

    if (track.previewUrl && !isValidSpotifyPreviewUrl(track.previewUrl)) return false;

    return true;
  });
}

function scoreTrackForSelection(track: MappedTrack) {
  let score = track.popularity;
  if (track.previewUrl) score += 60;
  score += Math.random() * 25;
  return score;
}

function chooseTopTracks(
  tracks: MappedTrack[],
  excludeKeywords: string[],
  prompt = "",
  preferredCount = 5
) {
  const filteredTracks = filterTracks(tracks, excludeKeywords, prompt);

  if (filteredTracks.length === 0 && tracks.length > 0) {
    const relaxed = [...tracks]
      .filter((track) => !prompt || !isKeywordStuffedTitle(track.name, prompt))
      .sort((a, b) => b.popularity - a.popularity);

    return {
      tracks: relaxed.slice(0, preferredCount),
      warning: true,
    };
  }

  const withPreview = filteredTracks.filter((track) => track.previewUrl);
  const withoutPreview = filteredTracks.filter((track) => !track.previewUrl);
  const candidatePool =
    withPreview.length >= preferredCount
      ? withPreview
      : [...withPreview, ...withoutPreview];

  const rankedTracks = [...candidatePool].sort(
    (a, b) => scoreTrackForSelection(b) - scoreTrackForSelection(a)
  );

  const diverseTracks: MappedTrack[] = [];
  const deferredTracks: MappedTrack[] = [];
  const seenArtists = new Set<string>();

  for (const track of rankedTracks) {
    const artistKey = track.artist.toLowerCase();
    if (!seenArtists.has(artistKey)) {
      seenArtists.add(artistKey);
      diverseTracks.push(track);
    } else {
      deferredTracks.push(track);
    }
  }

  const chosen = [...diverseTracks, ...deferredTracks].slice(0, preferredCount);
  const playableCount = chosen.filter((track) => track.previewUrl).length;

  return {
    tracks: chosen,
    warning: chosen.length < 3 || playableCount < Math.min(3, chosen.length),
  };
}

function buildSemanticSearchQueries(agentConfig: AgentOutput) {
  const seedGenres = agentConfig.seed_genres
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);

  const referenceArtists = shuffleItems(
    seedGenres.flatMap((genre) => FALLBACK_REFERENCE_ARTISTS[genre] || [])
  );

  const artistPool = Array.from(
    new Set(shuffleItems([...agentConfig.seed_artists, ...referenceArtists]))
  );

  const queries = artistPool.slice(0, 10).map((artist) => `artist:"${artist}"`);

  return shuffleItems(queries);
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

  const accessToken = String(data.access_token);
  cachedToken = accessToken;
  tokenExpiresAt = now + Math.max(0, data.expires_in - 60) * 1000;
  return accessToken;
}

async function getGroqCurationAgent(prompt: string): Promise<AgentOutput> {
  const groqApiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!groqApiKey) {
    throw new Error("Missing Groq API Key in environment variables");
  }

  try {
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
              content: `You are an expert Spotify API parameter generator. Translate the user's emotional vibe into strict Spotify parameters. Return ONLY valid JSON.

Schema:
{
  "seed_genres": "comma-separated string of 1 to 3 genres",
  "seed_artists": ["artist name", "artist name"],
  "target_energy": 0.0,
  "target_valence": 0.0,
  "target_danceability": 0.0,
  "exclude_keywords": ["string"]
}

Rules:
1. "seed_genres" MUST use 1 to 3 genres ONLY from: [${ALLOWED_GENRES.join(", ")}].
2. "seed_artists" MUST be 3 to 5 real, recognizable artists that match the vibe. Never invent fake artists.
3. "target_energy" is 0.0 calm to 1.0 intense.
4. "target_valence" is 0.0 dark to 1.0 euphoric.
5. "target_danceability" is 0.0 ambient to 1.0 club.
6. "exclude_keywords" must include artists, sub-genres, or production styles the user rejects.
7. Infer semantics from the prompt — translate mood and energy, never literal scene keywords. "Late night driving through a neon city" means nocturnal cinematic electronic/synth-pop (e.g. The Weeknd, Kavinsky, M83) with moderate energy — NOT a search for songs titled "neon cityscape".
8. Late-night romantic melodic vibes should use lower energy, warmer genres like r-n-b, soul, romance, chill, or acoustic, and artists like Daniel Caesar, Giveon, Snoh Aalegra, Frank Ocean, or SZA.
9. If the user rejects synthy/electronic sounds, exclude synth-pop, electronic, edm, techno and add synth-related exclude keywords.
10. Never return generic filler artists or royalty-free style names.
11. NEVER use the user's prompt words as search keywords. You are generating API parameters only.`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.35,
        }),
      }
    );

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

async function searchSpotifySemantic(
  agentConfig: AgentOutput,
  token: string
) {
  const queries = buildSemanticSearchQueries(agentConfig);
  const requests = queries.map(async (query) => {
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: "10",
      market: "US",
      offset: String(Math.floor(Math.random() * 10)),
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
        `Spotify semantic search failed for "${query}": ${response.status} ${errorText}`
      );
      return [];
    }

    const data = await response.json();
    return ((data.tracks?.items || []) as SpotifyTrack[])
      .map(mapTrack)
      .filter((track): track is MappedTrack => Boolean(track))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 4);
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

async function lookupSpotifyEmbedPreview(trackId: string): Promise<string> {
  try {
    const response = await fetch(
      `https://open.spotify.com/embed/track/${trackId}`,
      {
        headers: {
          "User-Agent": "CrateDigger/1.0",
        },
      }
    );

    if (!response.ok) return "";

    const html = await response.text();
    const match = html.match(/https:\/\/p\.scdn\.co\/mp3-preview\/[^"\\]+/);
    return match?.[0] ?? "";
  } catch (error) {
    console.error(`Spotify embed preview lookup failed for ${trackId}:`, error);
    return "";
  }
}

async function enrichTracksWithSpotifyPreviews(
  tracks: MappedTrack[]
): Promise<MappedTrack[]> {
  const enriched: MappedTrack[] = [];

  for (const track of tracks) {
    if (track.previewUrl) {
      enriched.push(track);
      continue;
    }

    const previewUrl = await lookupSpotifyEmbedPreview(track.id);
    const safePreview = isValidSpotifyPreviewUrl(previewUrl) ? previewUrl : "";
    enriched.push(safePreview ? { ...track, previewUrl: safePreview } : track);
  }

  return enriched;
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
      tracks = await searchSpotifySemantic(agentConfig, token);
    }

    if (tracks.length === 0) {
      source = "semantic_search";
      warning = true;
      tracks = await searchSpotifySemantic(agentConfig, token);
    }

    const uniqueTracks = dedupeTracks(tracks);
    let enrichedTracks = await enrichTracksWithSpotifyPreviews(uniqueTracks);
    let chosen = chooseTopTracks(
      enrichedTracks,
      agentConfig.exclude_keywords,
      cleanPrompt
    );

    const playableCount = chosen.tracks.filter((track) => track.previewUrl).length;
    if (playableCount < 3 && uniqueTracks.length > 0) {
      const extraTracks = await searchSpotifySemantic(agentConfig, token);
      const merged = dedupeTracks([...enrichedTracks, ...extraTracks]);
      enrichedTracks = await enrichTracksWithSpotifyPreviews(merged);
      chosen = chooseTopTracks(
        enrichedTracks,
        agentConfig.exclude_keywords,
        cleanPrompt
      );
    }

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
