export interface TrackFeedbackEntry {
  trackId: string;
  trackName: string;
  artist: string;
  type: "up" | "down";
  at: number;
}

export interface FeedbackSummary {
  likedArtists: string[];
  dislikedArtists: string[];
  dislikedTrackIds: string[];
}

const STORAGE_KEY = "crateDiggerFeedback";

function readEntries(): TrackFeedbackEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackFeedbackEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: TrackFeedbackEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 200)));
}

export function getTrackFeedbackMap(): Record<string, "up" | "down"> {
  const map: Record<string, "up" | "down"> = {};
  for (const entry of readEntries()) {
    map[entry.trackId] = entry.type;
  }
  return map;
}

export function saveTrackFeedback(
  trackId: string,
  trackName: string,
  artist: string,
  type: "up" | "down" | null
) {
  const entries = readEntries().filter((entry) => entry.trackId !== trackId);

  if (type) {
    entries.unshift({
      trackId,
      trackName,
      artist,
      type,
      at: Date.now(),
    });
  }

  writeEntries(entries);
}

export function getFeedbackSummary(): FeedbackSummary {
  const entries = readEntries();
  const likedArtists = new Set<string>();
  const dislikedArtists = new Set<string>();
  const dislikedTrackIds = new Set<string>();

  for (const entry of entries) {
    const artistKey = entry.artist.trim();
    if (!artistKey) continue;

    if (entry.type === "up") {
      likedArtists.add(artistKey);
      dislikedArtists.delete(artistKey);
    } else {
      dislikedArtists.add(artistKey);
      dislikedTrackIds.add(entry.trackId);
    }
  }

  return {
    likedArtists: Array.from(likedArtists).slice(0, 12),
    dislikedArtists: Array.from(dislikedArtists).slice(0, 20),
    dislikedTrackIds: Array.from(dislikedTrackIds).slice(0, 40),
  };
}
