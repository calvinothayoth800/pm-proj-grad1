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
  "lo-fi",
  "metal",
  "pop",
  "punk",
  "r-n-b",
  "rock",
  "romance",
  "sad",
  "soul",
  "study",
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
  track_count: 5,
  target_artist: null,
  target_track: null,
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
  "lo-fi": ["idealism", "Jinsang", "Saib", "Elijah Who", "Kudasai", "Nujabes", "J Dilla"],
  study: ["idealism", "Jinsang", "Saib", "Elijah Who", "Kudasai"],
  "synth-pop": ["The Weeknd", "Kavinsky", "CHVRCHES", "M83", "The Midnight"],
  techno: ["Charlotte de Witte", "Amelie Lens", "Adam Beyer"],
};

const REGIONAL_ARTIST_HINTS: Record<string, string[]> = {
  hindi: ["Arijit Singh", "Sunidhi Chauhan", "Shreya Ghoshal", "Pritam", "Badshah"],
  bollywood: ["Arijit Singh", "Sunidhi Chauhan", "Atif Aslam", "A.R. Rahman", "Neha Kakkar"],
  desi: ["Arijit Singh", "Diljit Dosanjh", "AP Dhillon", "Shreya Ghoshal", "Badshah"],
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
  track_count: number;
  target_artist?: string | null;
  target_track?: string | null;
}

interface CurationFeedback {
  likedArtists?: string[];
  dislikedArtists?: string[];
  dislikedTrackIds?: string[];
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: Array<{ id?: string; name?: string }>;
  external_urls?: { spotify?: string };
  album?: { images?: Array<{ url?: string }> };
  preview_url?: string | null;
  popularity?: number;
}

export interface MappedTrack {
  id: string;
  name: string;
  artist: string;
  artist_ids: string[];
  url: string;
  imageUrl: string;
  previewUrl: string;
  popularity: number;
  artist_genres: string[];
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

  const parsedTrackCount = typeof value.track_count === "number" ? value.track_count : Number(value.track_count);

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
    track_count: Number.isFinite(parsedTrackCount)
      ? Math.min(10, Math.max(1, Math.round(parsedTrackCount)))
      : 5,
    target_artist: typeof value.target_artist === "string" ? value.target_artist : null,
    target_track: typeof value.target_track === "string" ? value.target_track : null,
  };
}

function mapTrack(track: SpotifyTrack): MappedTrack | null {
  if (!track.id) return null;

  return {
    id: track.id,
    name: track.name || "Unknown Track",
    artist: track.artists?.[0]?.name || "Unknown Artist",
    artist_ids: track.artists?.map((a) => a.id).filter((id): id is string => Boolean(id)) || [],
    url: track.external_urls?.spotify || "",
    imageUrl: track.album?.images?.[0]?.url || "",
    previewUrl: track.preview_url || "",
    popularity: track.popularity || 0,
    artist_genres: [],
  };
}

export async function fetchArtistGenres(artistIds: string[], token: string): Promise<Record<string, string[]>> {
  const uniqueIds = Array.from(new Set(artistIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const maxPerRequest = 50;
  const batches = [];

  for (let i = 0; i < uniqueIds.length; i += maxPerRequest) {
    batches.push(uniqueIds.slice(i, i + maxPerRequest));
  }

  const genreMap: Record<string, string[]> = {};

  try {
    const responses = await Promise.all(
      batches.map(async (batch) => {
        const res = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(",")}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          console.warn(`Spotify Artist Fetch Failed: ${res.status}`);
          return [];
        }

        const data = await res.json();
        return data.artists || [];
      })
    );

    responses.flat().forEach((artist: any) => {
      if (artist && artist.id) {
        genreMap[artist.id] = artist.genres || [];
      }
    });

  } catch (error) {
    console.error("Critical failure fetching artist genres:", error);
  }

  return genreMap;
}

export async function injectArtistGenres(tracks: MappedTrack[], token: string): Promise<MappedTrack[]> {
  const allArtistIds = tracks.flatMap((t) => t.artist_ids);
  const genresMap = await fetchArtistGenres(allArtistIds, token);
  return tracks.map((track) => ({
    ...track,
    artist_genres: Array.from(
      new Set(track.artist_ids.flatMap((id) => genresMap[id] || []))
    ),
  }));
}

const KNOWN_ARTIST_GENRES: Record<string, string[]> = {
  "jinsang": ["lofi", "chillhop", "beats", "instrumental"],
  "kudasaibeats": ["lofi", "chillhop", "beats", "instrumental"],
  "saib": ["lofi", "chillhop", "beats", "instrumental"],
  "idealism": ["lofi", "chillhop", "beats", "instrumental"],
  "elijah who": ["lofi", "chillhop", "beats", "instrumental"],
  "sleepy fish": ["lofi", "chillhop", "beats", "instrumental"],
  "beatmaker": ["lofi", "chillhop", "beats", "instrumental"],
  "chillhop": ["lofi", "chillhop", "beats", "instrumental"],
  "lofi kid": ["lofi", "chillhop", "beats", "instrumental"],
  "sleepy": ["lofi", "chillhop", "beats", "instrumental"],
};

const KNOWN_TRACK_GENRES: Record<string, string[]> = {
  // Nujabes vocal tracks
  "feather": ["lofi", "chillhop", "rap", "vocals", "hip-hop"],
  "luv(sic)": ["lofi", "chillhop", "rap", "vocals", "hip-hop"],
  "luv(sic), pt. 2": ["lofi", "chillhop", "rap", "vocals", "hip-hop"],
  "luv(sic), pt. 3": ["lofi", "chillhop", "rap", "vocals", "hip-hop"],
  "f.i.l.o.": ["lofi", "chillhop", "rap", "vocals", "hip-hop"],
  "lady brown": ["lofi", "chillhop", "rap", "vocals", "hip-hop"],
  
  // Idealism lofi beats
  "ikigai": ["lofi", "chillhop", "beats", "instrumental"],
  "phat pug": ["lofi", "chillhop", "beats", "instrumental"],
  "controlla": ["lofi", "chillhop", "beats", "instrumental"],
  "both of us": ["lofi", "chillhop", "beats", "instrumental"],
  
  // Kudasaibeats lofi beats
  "attached": ["lofi", "chillhop", "beats", "instrumental"],
  "dream of her": ["lofi", "chillhop", "beats", "instrumental"],
  
  // Jinsang lofi beats
  "quiet": ["lofi", "chillhop", "beats", "instrumental"],
  "herewego": ["lofi", "chillhop", "beats", "instrumental"],
  
  // Saib lofi beats
  "in your arms": ["lofi", "chillhop", "beats", "instrumental"],
  "daydreaming": ["lofi", "chillhop", "beats", "instrumental"]
};

export async function classifyTracksWithGroq(tracks: MappedTrack[]): Promise<MappedTrack[]> {
  if (tracks.length === 0) {
    return tracks;
  }

  const resolvedTracks: MappedTrack[] = [];
  const tracksToClassify: MappedTrack[] = [];

  for (const track of tracks) {
    const trackNameLower = (track.name || "").toLowerCase().trim();
    const artistLower = (track.artist || "").toLowerCase().trim();

    if (KNOWN_TRACK_GENRES[trackNameLower]) {
      resolvedTracks.push({
        ...track,
        artist_genres: [...KNOWN_TRACK_GENRES[trackNameLower]]
      });
    } else if (KNOWN_ARTIST_GENRES[artistLower]) {
      resolvedTracks.push({
        ...track,
        artist_genres: [...KNOWN_ARTIST_GENRES[artistLower]]
      });
    } else {
      tracksToClassify.push(track);
    }
  }

  if (tracksToClassify.length === 0) {
    return resolvedTracks;
  }

  const groqApiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!groqApiKey) {
    return [...resolvedTracks, ...tracksToClassify];
  }

  const trackList = tracksToClassify.map((t) => ({
    id: t.id,
    name: t.name,
    artist: t.artist,
  }));

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
            content: `You are an expert music catalog classifier. Given a list of tracks, classify each track's primary genres and vocal presence. 
Return ONLY valid JSON where keys are track IDs and values are arrays of lowercase strings representing the genres and features (e.g. ["lofi", "beats", "chillhop", "rap", "vocals", "pop", "rnb", "electronic", "instrumental"]).
Be extremely precise:
- Check if the specific track has vocal singing or rap verses (e.g. "F.I.L.O." by Nujabes has rap vocals by Shing02, so it should contain "rap" and "vocals", not "instrumental").
- If the track has a featured artist or guest vocalist, or is a vocal song, include "vocals" and "singing" or "rap".
- If the track is a purely instrumental beat or track, include "instrumental".`,
          },
          {
            role: "user",
            content: JSON.stringify(trackList, null, 2),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.warn("Groq genre classification failed, using fallbacks.");
      return [...resolvedTracks, ...tracksToClassify];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const classifications: Record<string, string[]> = JSON.parse(content);

    const classifiedTracks = tracksToClassify.map((track) => ({
      ...track,
      artist_genres: Array.from(new Set(classifications[track.id] || [])),
    }));

    return [...resolvedTracks, ...classifiedTracks];

  } catch (error) {
    console.error("Failure classifying tracks with Groq:", error);
    return [...resolvedTracks, ...tracksToClassify];
  }
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

export function filterTracks(
  tracks: MappedTrack[],
  excludeKeywords: string[],
  prompt = "",
  options: {
    checkPopularity?: boolean;
    excludeKeywordsOverride?: string[];
  } = {}
) {
  const checkPopularity = options.checkPopularity ?? true;
  const activeExcludes = options.excludeKeywordsOverride ?? excludeKeywords;

  return tracks.filter((track) => {
    const haystack = `${track.name} ${track.artist}`.toLowerCase();

    const matchesExclusion = activeExcludes.some((keyword) => {
      const cleanKeyword = keyword.trim().toLowerCase();
      if (!cleanKeyword) return false;
      if (haystack.includes(cleanKeyword)) return true;
      if (
        track.artist_genres &&
        track.artist_genres.some((g) => g.toLowerCase().includes(cleanKeyword))
      ) {
        return true;
      }
      return false;
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

    if (checkPopularity && track.popularity < MIN_TRACK_POPULARITY) return false;

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

export function chooseTopTracks(
  tracks: MappedTrack[],
  excludeKeywords: string[],
  prompt = "",
  preferredCount = 5
) {
  let filteredTracks = filterTracks(tracks, excludeKeywords, prompt, {
    checkPopularity: true,
    excludeKeywordsOverride: excludeKeywords,
  });

  let fallbackTier: 1 | 2 | 3 | null = null;

  if (filteredTracks.length === 0 && tracks.length > 0) {
    filteredTracks = filterTracks(tracks, excludeKeywords, prompt, {
      checkPopularity: false,
      excludeKeywordsOverride: excludeKeywords,
    });
    fallbackTier = 1;
  }

  const isLofiPrompt = (/(lo[ -]?fi|chill|study|sleep|ambient|coding|work|relax)/i.test(prompt) || 
    excludeKeywords.some(k => ["rap", "vocals", "pop", "edm"].includes(k.toLowerCase()))) &&
    !/(rap|pop|vocal|edm|electronic|house|sing)/i.test(prompt);

  // Core lofi/vocal/pop/rap exclusions we want to preserve at Tier 2 and Tier 3
  const coreLofiExcludes = isLofiPrompt 
    ? excludeKeywords.filter(k => ["rap", "vocals", "vocal", "singing", "singer", "pop", "edm", "rnb", "r-n-b", "house", "dance"].includes(k.toLowerCase()))
    : [];

  if (filteredTracks.length === 0 && tracks.length > 0) {
    const primaryExclude = excludeKeywords.length > 0 ? [excludeKeywords[0]] : [];
    const activeExcludes = Array.from(new Set([...primaryExclude, ...coreLofiExcludes]));
    filteredTracks = filterTracks(tracks, excludeKeywords, prompt, {
      checkPopularity: false,
      excludeKeywordsOverride: activeExcludes,
    });
    fallbackTier = 2;
  }

  if (filteredTracks.length === 0 && tracks.length > 0) {
    const matching = filterTracks(tracks, excludeKeywords, prompt, {
      checkPopularity: false,
      excludeKeywordsOverride: coreLofiExcludes,
    });
    filteredTracks = [...matching].sort((a, b) => b.popularity - a.popularity);
    fallbackTier = 3;
  }

  if (filteredTracks.length === 0) {
    return {
      tracks: [],
      warning: true,
      fallbackTier: null,
    };
  }

  let chosen: MappedTrack[] = [];
  if (fallbackTier === 3) {
    chosen = filteredTracks.slice(0, preferredCount);
  } else {
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

    chosen = [...diverseTracks, ...deferredTracks].slice(0, preferredCount);
  }

  const playableCount = chosen.filter((track) => track.previewUrl).length;

  return {
    tracks: chosen,
    warning: fallbackTier !== null || chosen.length < 3 || playableCount < Math.min(3, chosen.length),
    fallbackTier,
  };
}

function applyFeedbackToAgent(
  agent: AgentOutput,
  feedback?: CurationFeedback
): AgentOutput {
  if (!feedback) return agent;

  const disliked = (feedback.dislikedArtists || []).map((artist) =>
    artist.toLowerCase()
  );
  const liked = feedback.likedArtists || [];

  return {
    ...agent,
    seed_artists: Array.from(
      new Set([...liked.slice(0, 3), ...agent.seed_artists])
    ).slice(0, 6),
    exclude_keywords: sanitizeKeywords([
      ...agent.exclude_keywords,
      ...disliked,
    ]),
  };
}

function getRegionalExcludes(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  if (!/(hindi|desi|bollywood|indian|punjabi)/.test(lower)) return [];

  return [
    "taylor swift",
    "dua lipa",
    "the weeknd",
    "ed sheeran",
    "arctic monkeys",
    "bon iver",
    "frank ocean",
    "drake",
    "calvin harris",
    "justin bieber",
    "coldplay",
    "hozier",
    "the xx",
  ];
}

function getLofiExcludes(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  if (!/(lofi|lo-fi|study|coding|beats)/.test(lower)) return [];

  return [
    "kendrick lamar",
    "j. cole",
    "drake",
    "travis scott",
    "kanye west",
    "eminem",
    "future",
    "playboi carti",
    "lil baby",
    "21 savage",
    "taylor swift",
    "dua lipa",
    "the weeknd",
    "ed sheeran",
    "ariana grande",
    "justin bieber",
    "maroon 5",
    "coldplay",
    "billie eilish",
    "post malone",
    "tyler, the creator",
    "kali uchis",
    "mac miller",
    "a$ap rocky",
    "kid cudi",
    "lil uzi vert",
    "rap",
    "vocals",
    "vocal",
    "singing",
    "singer",
    "pop",
    "r-n-b",
    "r&b",
  ];
}

function getRegionalArtistHints(prompt: string) {
  const lower = prompt.toLowerCase();
  const hints: string[] = [];

  for (const [keyword, artists] of Object.entries(REGIONAL_ARTIST_HINTS)) {
    if (lower.includes(keyword)) {
      hints.push(...artists);
    }
  }

  return Array.from(new Set(hints));
}

export function buildSemanticSearchQueries(agentConfig: AgentOutput, prompt = "") {
  const priorityQueries: string[] = [];
  
  if (agentConfig.target_track) {
    if (agentConfig.target_artist) {
      priorityQueries.push(`track:"${agentConfig.target_track}" artist:"${agentConfig.target_artist}"`);
    } else {
      priorityQueries.push(`track:"${agentConfig.target_track}"`);
    }
  } else if (agentConfig.target_artist) {
    priorityQueries.push(`artist:"${agentConfig.target_artist}"`);
  }

  const seedGenres = agentConfig.seed_genres
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);

  const referenceArtists = shuffleItems(
    seedGenres.flatMap((genre) => FALLBACK_REFERENCE_ARTISTS[genre] || [])
  );

  const regionalArtists = getRegionalArtistHints(prompt);

  const artistPool = Array.from(
    new Set(
      shuffleItems([
        ...agentConfig.seed_artists,
        ...referenceArtists,
        ...regionalArtists,
      ])
    )
  );

  const artistQueries = artistPool.slice(0, 8).map((artist) => `artist:"${artist}"`);
  const genreQueries = seedGenres.map((genre) => `genre:"${genre}"`);

  return [...priorityQueries, ...shuffleItems([...artistQueries, ...genreQueries])];
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

async function getGroqCurationAgent(
  prompt: string,
  feedback?: CurationFeedback
): Promise<AgentOutput> {
  const groqApiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!groqApiKey) {
    throw new Error("Missing Groq API Key in environment variables");
  }

  let userContent = prompt;
  if (feedback?.likedArtists?.length) {
    userContent += `\nUser liked artists to lean toward: ${feedback.likedArtists.join(", ")}`;
  }
  if (feedback?.dislikedArtists?.length) {
    userContent += `\nUser disliked artists to avoid: ${feedback.dislikedArtists.join(", ")}`;
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
  "exclude_keywords": ["string"],
  "track_count": 5,
  "target_artist": "string or null",
  "target_track": "string or null"
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
11. NEVER use the user's prompt words as search keywords. You are generating API parameters only.
12. For Hindi, desi, Bollywood, or Indian requests: seed_artists must be Indian artists only (Arijit Singh, Sunidhi Chauhan, Shreya Ghoshal, Pritam, Badshah, A.R. Rahman). exclude_keywords must include western pop artists like Taylor Swift, Dua Lipa, The Weeknd, Ed Sheeran.
13. "track_count" is the number of songs/tracks requested by the user, between 1 and 10. Default to 5 if not specified in the prompt.
14. For lofi, study, coding, or chill beats prompts: seed_genres MUST include lo-fi or study. seed_artists must be lofi/chillhop artists only (Nujabes, J Dilla, idealism, Kudasai, Saib, Jinsang, Elijah Who). exclude_keywords must include mainstream hip-hop/pop artists (Kendrick Lamar, J. Cole, Drake, Taylor Swift, etc.) to keep it instrumental/chill.
15. If the user explicitly requests a specific artist, add the artist's name to "target_artist". If they request a specific song title, add it to "target_track".`,
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.35,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("Groq API rate limit hit (429); falling back to default agent output.");
      }
      throw new Error(`Groq API returned ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return applyFeedbackToAgent(
      sanitizeAgentOutput(JSON.parse(content)),
      feedback
    );
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
    limit: "80",
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
  token: string,
  prompt = ""
) {
  const queries = buildSemanticSearchQueries(agentConfig, prompt);
  const requests = queries.map(async (query) => {
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: "25",
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
      .slice(0, 12);
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

    tracks = await classifyTracksWithGroq(tracks);

    const parsedExistingIds = Array.isArray(existingTrackIds)
      ? new Set<string>(existingTrackIds.map(String))
      : new Set<string>();

    let uniqueTracks = dedupeTracks(tracks).filter(
      (track) => !feedbackContext?.dislikedTrackIds?.includes(track.id) && !parsedExistingIds.has(track.id)
    );
    uniqueTracks = shuffleItems(uniqueTracks);
    let enrichedTracks = await enrichTracksWithSpotifyPreviews(uniqueTracks);
    let chosen = chooseTopTracks(
      enrichedTracks,
      agentConfig.exclude_keywords,
      cleanPrompt,
      preferredCount
    );

    let playableCount = chosen.tracks.filter((track) => track.previewUrl).length;
    const isLofiPrompt = (/(lo[ -]?fi|chill|study|sleep|ambient|coding|work|relax)/i.test(cleanPrompt) || 
      agentConfig.exclude_keywords.some(k => ["rap", "vocals", "pop", "edm"].includes(k.toLowerCase()))) &&
      !/(rap|pop|vocal|edm|electronic|house|sing)/i.test(cleanPrompt);

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
      extraTracks = await classifyTracksWithGroq(extraTracks);
      const uniqueExtra = extraTracks.filter((t) => !parsedExistingIds.has(t.id));
      const merged = dedupeTracks([...enrichedTracks, ...uniqueExtra]);
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
      const STATIC_LOFI_BACKFILLS = [
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
      const shuffledBackfills = shuffleItems(STATIC_LOFI_BACKFILLS);
      
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
        const classifiedBackfill = await classifyTracksWithGroq(resolved);
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
          exclude_keywords: [], // Drop exclusions to guarantee matches
        },
        token,
        cleanPrompt
      );
      finalExtra = await classifyTracksWithGroq(finalExtra);
      const uniqueFinal = finalExtra.filter((t) => !parsedExistingIds.has(t.id));
      const merged = dedupeTracks([...enrichedTracks, ...uniqueFinal]);
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
