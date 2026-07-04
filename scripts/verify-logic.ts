import assert from "node:assert";
import test from "node:test";
import { filterTracks, chooseTopTracks, MappedTrack } from "../app/api/curate/route.js";
import { sanitizePlan } from "../app/api/playlist-agent/route.js";

// Dummy tracks
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

test("Advanced Filtering - filterTracks", async (t) => {
  await t.test("should successfully keep a track if no exclude_keywords match", () => {
    const results = filterTracks([dummyTrack], ["rock", "pop"], "neon vibe");
    assert.strictEqual(results.length, 1);
  });

  await t.test("should successfully drop a track when an exclude_keyword matches the track's artist name", () => {
    const results = filterTracks([dummyTrack], ["kavinsky"], "neon vibe");
    assert.strictEqual(results.length, 0);
  });

  await t.test("should successfully drop a track when an exclude_keyword matches an item in artist_genres", () => {
    const results = filterTracks([dummyTrack], ["synthwave"], "neon vibe");
    assert.strictEqual(results.length, 0);
  });

  await t.test("should successfully drop a track when an exclude_keyword matches a sub-genre in artist_genres", () => {
    const results = filterTracks([dummyTrack], ["electro"], "neon vibe");
    assert.strictEqual(results.length, 0);
  });
});

test("Tiered Fallback Pipeline - chooseTopTracks", async (t) => {
  const lowPopularityTrack: MappedTrack = {
    ...dummyTrack,
    id: "track_low",
    popularity: 5, // Below MIN_TRACK_POPULARITY (15)
    artist_genres: ["synth-pop"],
  };

  await t.test("should execute Tier 0 (normal) and return tracks with popularity >= 15", () => {
    const result = chooseTopTracks([dummyTrack], ["rap"], "neon vibe", 5);
    assert.strictEqual(result.tracks.length, 1);
    assert.strictEqual(result.tracks[0].id, "track_1");
    assert.strictEqual(result.fallbackTier, null);
  });

  await t.test("should fallback to Tier 1 (drop popularity floor) if standard filter returns 0 tracks", () => {
    const result = chooseTopTracks([lowPopularityTrack], ["rap"], "neon vibe", 5);
    assert.strictEqual(result.tracks.length, 1);
    assert.strictEqual(result.tracks[0].id, "track_low");
    assert.strictEqual(result.fallbackTier, 1);
  });

  await t.test("should fallback to Tier 2 (drop secondary exclusions) if Tier 1 is still empty", () => {
    const result = chooseTopTracks(
      [lowPopularityTrack],
      ["chill", "synth-pop"],
      "neon vibe",
      5
    );
    assert.strictEqual(result.tracks.length, 1);
    assert.strictEqual(result.tracks[0].id, "track_low");
    assert.strictEqual(result.fallbackTier, 2);
  });

  await t.test("should fallback to Tier 3 (drop all semantic constraints, sort by popularity) if Tier 2 is still empty", () => {
    const result = chooseTopTracks(
      [lowPopularityTrack],
      ["synth-pop"],
      "neon vibe",
      5
    );
    assert.strictEqual(result.tracks.length, 1);
    assert.strictEqual(result.tracks[0].id, "track_low");
    assert.strictEqual(result.fallbackTier, 3);
  });

  await t.test("should sort purely by popularity at Tier 3", () => {
    const trackA = { ...dummyTrack, id: "track_a", popularity: 20 };
    const trackB = { ...dummyTrack, id: "track_b", popularity: 80 };
    const trackC = { ...dummyTrack, id: "track_c", popularity: 40 };

    const result = chooseTopTracks([trackA, trackB, trackC], ["electronic"], "neon", 5);
    assert.strictEqual(result.fallbackTier, 3);
    assert.strictEqual(result.tracks.length, 3);
    assert.strictEqual(result.tracks[0].id, "track_b");
    assert.strictEqual(result.tracks[1].id, "track_c");
    assert.strictEqual(result.tracks[2].id, "track_a");
  });

  await t.test("should respect preferredCount and return up to that number of tracks", () => {
    const trackA = { ...dummyTrack, id: "track_a", popularity: 20 };
    const trackB = { ...dummyTrack, id: "track_b", popularity: 80 };
    const trackC = { ...dummyTrack, id: "track_c", popularity: 40 };

    const result = chooseTopTracks([trackA, trackB, trackC], [], "", 2);
    assert.strictEqual(result.tracks.length, 2);
  });
});

test("Playlist Helper Upgrades", async (t) => {
  const currentTracksSet = new Set(["t_1", "t_2", "t_3", "t_4", "t_5"]);

  await t.test("should silently strip out fake/hallucinated track IDs", () => {
    const rawPlan = {
      explanation: "Remove mismatch tracks",
      remove_track_ids: ["t_2", "t_fake_1", "t_4", "t_fake_2"],
      add_prompt: null,
      add_count: 3,
    };

    const sanitized = sanitizePlan(rawPlan, currentTracksSet);
    assert.deepStrictEqual(sanitized.remove_track_ids, ["t_2", "t_4"]);
  });

  await t.test("should cap add_count to a maximum of 10", () => {
    const rawPlan = {
      explanation: "Add a lot of tracks",
      remove_track_ids: [],
      add_prompt: "pop vibes",
      add_count: 25,
    };

    const sanitized = sanitizePlan(rawPlan, currentTracksSet);
    assert.strictEqual(sanitized.add_count, 10);
  });

  await t.test("should enforce catastrophic deletion guard, capping at 80% (rounded down) if 100% deletion is requested", () => {
    const rawPlan = {
      explanation: "Delete everything",
      remove_track_ids: ["t_1", "t_2", "t_3", "t_4", "t_5"],
      add_prompt: null,
      add_count: 0,
    };

    const sanitized = sanitizePlan(rawPlan, currentTracksSet);
    assert.strictEqual(sanitized.remove_track_ids.length, 4);
    assert.deepStrictEqual(sanitized.remove_track_ids, ["t_1", "t_2", "t_3", "t_4"]);
  });

  await t.test("should enforce catastrophic deletion guard for a single-track playlist (capping at 0)", () => {
    const singleTrackSet = new Set(["t_only"]);
    const rawPlan = {
      explanation: "Delete only track",
      remove_track_ids: ["t_only"],
      add_prompt: null,
      add_count: 0,
    };

    const sanitized = sanitizePlan(rawPlan, singleTrackSet);
    assert.strictEqual(sanitized.remove_track_ids.length, 0);
  });
});
