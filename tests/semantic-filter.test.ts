import { filterTracks, chooseTopTracks, MappedTrack } from "../app/api/curate/route";
import { sanitizePlan } from "../app/api/playlist-agent/route";

describe("Post-Retrieval Semantic Filter Upgrade", () => {
  const dummyTrack: MappedTrack = {
    id: "track_1",
    name: "Nightcall",
    artist: "Kavinsky",
    artist_ids: ["artist_1"],
    url: "https://spotify.com/track/1",
    imageUrl: "https://spotify.com/image/1",
    previewUrl: "https://p.scdn.co/mp3-preview/1",
    popularity: 50,
    artist_genres: ["synthwave", "electronic"],
  };

  describe("filterTracks Advanced Filtering", () => {
    it("should successfully keep a track if no exclude_keywords match", () => {
      const results = filterTracks([dummyTrack], ["rock", "pop"], "neon vibe");
      expect(results.length).toBe(1);
    });

    it("should successfully drop a track when an exclude_keyword matches the track's artist name", () => {
      const results = filterTracks([dummyTrack], ["kavinsky"], "neon vibe");
      expect(results.length).toBe(0);
    });

    it("should successfully drop a track when an exclude_keyword matches an item in artist_genres", () => {
      const results = filterTracks([dummyTrack], ["synthwave"], "neon vibe");
      expect(results.length).toBe(0);
    });

    it("should successfully drop a track when an exclude_keyword matches a sub-genre in artist_genres", () => {
      const results = filterTracks([dummyTrack], ["electro"], "neon vibe");
      expect(results.length).toBe(0);
    });
  });

  describe("chooseTopTracks Tiered Fallback Pipeline", () => {
    const lowPopularityTrack: MappedTrack = {
      ...dummyTrack,
      id: "track_low",
      popularity: 5, // Below MIN_TRACK_POPULARITY (15)
      artist_genres: ["synth-pop"],
    };

    const forbiddenTrack: MappedTrack = {
      ...dummyTrack,
      id: "track_forbidden",
      popularity: 60,
      artist_genres: ["rap", "hip-hop"],
    };

    it("should execute Tier 0 (normal) and return tracks with popularity >= 15", () => {
      const result = chooseTopTracks([dummyTrack], ["rap"], "neon vibe", 5);
      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].id).toBe("track_1");
      expect(result.fallbackTier).toBeNull();
    });

    it("should fallback to Tier 1 (drop popularity floor) if standard filter returns 0 tracks", () => {
      // Input has only lowPopularityTrack, which fails popularity floor (15)
      const result = chooseTopTracks([lowPopularityTrack], ["rap"], "neon vibe", 5);
      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].id).toBe("track_low");
      expect(result.fallbackTier).toBe(1);
    });

    it("should fallback to Tier 2 (drop secondary exclusions) if Tier 1 is still empty", () => {
      // Excludes: index 0: 'chill', index 1: 'synth-pop' (matches lowPopularityTrack's genres)
      // Since 'synth-pop' is a secondary exclusion (index 1), dropping it allows lowPopularityTrack to pass.
      const result = chooseTopTracks(
        [lowPopularityTrack],
        ["chill", "synth-pop"],
        "neon vibe",
        5
      );
      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].id).toBe("track_low");
      expect(result.fallbackTier).toBe(2);
    });

    it("should fallback to Tier 3 (drop all semantic constraints, sort by popularity) if Tier 2 is still empty", () => {
      // Excludes: index 0: 'synth-pop' (matches lowPopularityTrack's genres)
      // Even Tier 2 keeps index 0, so it would return empty.
      // Therefore it falls to Tier 3, drops all exclusions, and returns the track.
      const result = chooseTopTracks(
        [lowPopularityTrack],
        ["synth-pop"],
        "neon vibe",
        5
      );
      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].id).toBe("track_low");
      expect(result.fallbackTier).toBe(3);
    });

    it("should sort purely by popularity at Tier 3", () => {
      const trackA = { ...dummyTrack, id: "track_a", popularity: 20 };
      const trackB = { ...dummyTrack, id: "track_b", popularity: 80 };
      const trackC = { ...dummyTrack, id: "track_c", popularity: 40 };

      // Make sure all are filtered out by excluding "electronic" (matches dummyTrack's genres)
      const result = chooseTopTracks([trackA, trackB, trackC], ["electronic"], "neon", 5);
      expect(result.fallbackTier).toBe(3);
      expect(result.tracks.length).toBe(3);
      expect(result.tracks[0].id).toBe("track_b"); // Highest popularity
      expect(result.tracks[1].id).toBe("track_c");
      expect(result.tracks[2].id).toBe("track_a"); // Lowest popularity
    });

    it("should respect preferredCount and return up to that number of tracks", () => {
      const trackA = { ...dummyTrack, id: "track_a", popularity: 20 };
      const trackB = { ...dummyTrack, id: "track_b", popularity: 80 };
      const trackC = { ...dummyTrack, id: "track_c", popularity: 40 };

      const result = chooseTopTracks([trackA, trackB, trackC], [], "", 2);
      expect(result.tracks.length).toBe(2);
    });
  });
});

describe("Playlist Helper Upgrades", () => {
  const currentTracksSet = new Set(["t_1", "t_2", "t_3", "t_4", "t_5"]);

  it("should silently strip out fake/hallucinated track IDs", () => {
    const rawPlan = {
      explanation: "Remove mismatch tracks",
      remove_track_ids: ["t_2", "t_fake_1", "t_4", "t_fake_2"],
      add_prompt: null,
      add_count: 3,
    };

    const sanitized = sanitizePlan(rawPlan, currentTracksSet);
    expect(sanitized.remove_track_ids).toEqual(["t_2", "t_4"]);
  });

  it("should cap add_count to a maximum of 10", () => {
    const rawPlan = {
      explanation: "Add a lot of tracks",
      remove_track_ids: [],
      add_prompt: "pop vibes",
      add_count: 25, // Above limit
    };

    const sanitized = sanitizePlan(rawPlan, currentTracksSet);
    expect(sanitized.add_count).toBe(10);
  });

  it("should enforce catastrophic deletion guard, capping at 80% (rounded down) if 100% deletion is requested", () => {
    const rawPlan = {
      explanation: "Delete everything",
      remove_track_ids: ["t_1", "t_2", "t_3", "t_4", "t_5"], // 100% of 5 tracks
      add_prompt: null,
      add_count: 0,
    };

    const sanitized = sanitizePlan(rawPlan, currentTracksSet);
    // 5 * 0.8 = 4 tracks allowed to remove
    expect(sanitized.remove_track_ids.length).toBe(4);
    expect(sanitized.remove_track_ids).toEqual(["t_1", "t_2", "t_3", "t_4"]);
  });

  it("should enforce catastrophic deletion guard for a single-track playlist (capping at 0)", () => {
    const singleTrackSet = new Set(["t_only"]);
    const rawPlan = {
      explanation: "Delete only track",
      remove_track_ids: ["t_only"],
      add_prompt: null,
      add_count: 0,
    };

    const sanitized = sanitizePlan(rawPlan, singleTrackSet);
    // 1 * 0.8 = 0.8 -> rounded down to 0 tracks allowed to remove
    expect(sanitized.remove_track_ids.length).toBe(0);
  });
});
