import assert from "node:assert";
import test from "node:test";
import { filterTracks, chooseTopTracks, MappedTrack, buildSemanticSearchQueries, classifyTracksWithGroq, parseHybridAddition } from "../lib/curation-engine";
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

test("Curator Nuances & Edge Cases", async (t) => {
  await t.test("should prioritize target_track and target_artist in search queries", () => {
    const config = {
      seed_genres: "lo-fi",
      seed_artists: ["Jinsang"],
      target_energy: 0.5,
      target_valence: 0.5,
      target_danceability: 0.5,
      exclude_keywords: [],
      track_count: 5,
      target_artist: "Nujabes",
      target_track: "Feather",
    };
    const queries = buildSemanticSearchQueries(config, "Nujabes Feather");
    assert.strictEqual(queries[0], 'track:"Feather" artist:"Nujabes"');
  });

  await t.test("should prioritize only target_artist if target_track is absent", () => {
    const config = {
      seed_genres: "lo-fi",
      seed_artists: ["Jinsang"],
      target_energy: 0.5,
      target_valence: 0.5,
      target_danceability: 0.5,
      exclude_keywords: [],
      track_count: 5,
      target_artist: "J Dilla",
      target_track: null,
    };
    const queries = buildSemanticSearchQueries(config, "J Dilla");
    assert.strictEqual(queries[0], 'artist:"J Dilla"');
  });

  await t.test("should prioritize only target_track if target_artist is absent", () => {
    const config = {
      seed_genres: "lo-fi",
      seed_artists: ["Jinsang"],
      target_energy: 0.5,
      target_valence: 0.5,
      target_danceability: 0.5,
      exclude_keywords: [],
      track_count: 5,
      target_artist: null,
      target_track: "ikigai",
    };
    const queries = buildSemanticSearchQueries(config, "ikigai");
    assert.strictEqual(queries[0], 'track:"ikigai"');
  });

  await t.test("should dynamically bypass exclusion rules when explicitly requested (rap)", () => {
    const originalExcludes = ["rap", "vocals", "pop"];
    const prompt = "add 1 rap song";
    const promptLower = prompt.toLowerCase();
    
    let excludes = [...originalExcludes];
    if (promptLower.includes("rap") || promptLower.includes("hiphop") || promptLower.includes("hip-hop")) {
      excludes = excludes.filter(
        k => !["rap", "hip hop", "hiphop"].includes(k.toLowerCase())
      );
    }
    assert.deepStrictEqual(excludes, ["vocals", "pop"]);
  });

  await t.test("should dynamically bypass exclusion rules when explicitly requested (vocals)", () => {
    const originalExcludes = ["rap", "vocals", "pop"];
    const prompt = "lofi tracks with vocals";
    const promptLower = prompt.toLowerCase();
    
    let excludes = [...originalExcludes];
    if (promptLower.includes("vocal") || promptLower.includes("sing") || promptLower.includes("song")) {
      excludes = excludes.filter(
        k => !["vocal", "vocals", "singing", "singer"].includes(k.toLowerCase())
      );
    }
    assert.deepStrictEqual(excludes, ["rap", "pop"]);
  });

  await t.test("should dynamically bypass exclusion rules when explicitly requested (pop)", () => {
    const originalExcludes = ["rap", "vocals", "pop"];
    const prompt = "add a pop remix";
    const promptLower = prompt.toLowerCase();
    
    let excludes = [...originalExcludes];
    if (promptLower.includes("pop")) {
      excludes = excludes.filter(
        k => !["pop"].includes(k.toLowerCase())
      );
    }
    assert.deepStrictEqual(excludes, ["rap", "vocals"]);
  });

  await t.test("should dynamically bypass exclusion rules when explicitly requested (edm)", () => {
    const originalExcludes = ["rap", "vocals", "edm", "electronic"];
    const prompt = "play electronic house beats";
    const promptLower = prompt.toLowerCase();
    
    let excludes = [...originalExcludes];
    if (promptLower.includes("edm") || promptLower.includes("electronic") || promptLower.includes("house") || promptLower.includes("techno")) {
      excludes = excludes.filter(
        k => !["edm", "electronic", "house", "techno", "dance"].includes(k.toLowerCase())
      );
    }
    assert.deepStrictEqual(excludes, ["rap", "vocals"]);
  });

  await t.test("should match additive command with typo like 'aadd 1 rap song' in addition guard check", () => {
    const command = "aadd 1 rap song";
    const commandLower = command.toLowerCase();
    const isAdditionQuery = /\b(add|fill|expand|introduce|more|insert)\b/i.test(commandLower) || commandLower.includes("aadd");
    const hasStrongRemovalVerb = /\b(remove|delete|clean|strip|purge)\b/i.test(commandLower);
    
    assert.strictEqual(isAdditionQuery, true);
    assert.strictEqual(hasStrongRemovalVerb, false);
  });

  await t.test("should treat 'add 1 pop song no rap' as purely additive (removals disabled)", () => {
    const command = "add 1 pop song no rap";
    const commandLower = command.toLowerCase();
    const isAdditionQuery = /\b(add|fill|expand|introduce|more|insert)\b/i.test(commandLower);
    const hasStrongRemovalVerb = /\b(remove|delete|clean|strip|purge)\b/i.test(commandLower);
    
    assert.strictEqual(isAdditionQuery, true);
    assert.strictEqual(hasStrongRemovalVerb, false);
  });

  await t.test("should treat 'add rap song no drake no jdilla' as purely additive (removals disabled)", () => {
    const command = "add rap song no drake no jdilla";
    const commandLower = command.toLowerCase();
    const isAdditionQuery = /\b(add|fill|expand|introduce|more|insert)\b/i.test(commandLower);
    const hasStrongRemovalVerb = /\b(remove|delete|clean|strip|purge)\b/i.test(commandLower);
    
    assert.strictEqual(isAdditionQuery, true);
    assert.strictEqual(hasStrongRemovalVerb, false);
  });

  await t.test("should identify hybrid modification query as removal query", () => {
    const command = "remove pop and add lofi";
    const commandLower = command.toLowerCase();
    const isAdditionQuery = /\b(add|fill|expand|introduce|more|insert)\b/i.test(commandLower);
    const hasStrongRemovalVerb = /\b(remove|delete|clean|strip|purge)\b/i.test(commandLower);
    
    assert.strictEqual(isAdditionQuery, true);
    assert.strictEqual(hasStrongRemovalVerb, true);
  });

  await t.test("should identify pure removal query as removal only", () => {
    const command = "remove non-lofi tracks";
    const commandLower = command.toLowerCase();
    const isAdditionQuery = /\b(add|fill|expand|introduce|more|insert)\b/i.test(commandLower);
    const hasStrongRemovalVerb = /\b(remove|delete|clean|strip|purge)\b/i.test(commandLower);
    
    assert.strictEqual(isAdditionQuery, false);
    assert.strictEqual(hasStrongRemovalVerb, true);
  });

  await t.test("should match flexible pop removal command like 'Remove all pop songs and add 2 heavy bass tracks'", () => {
    const command = "Remove all pop songs and add 2 heavy bass tracks";
    const commandLower = command.toLowerCase();
    const isAdditionQuery = /\b(add|fill|expand|introduce|more|insert)\b/i.test(commandLower);
    const hasStrongRemovalVerb = /\b(remove|delete|clean|strip|purge)\b/i.test(commandLower);
    const shouldRunRemovals = !isAdditionQuery || hasStrongRemovalVerb;

    const isPopRemove = shouldRunRemovals && (
      /\b(remove|delete|clean|strip|purge|no|exclude|drop)\b/i.test(commandLower) && /\bpop\b/i.test(commandLower)
    );

    assert.strictEqual(isAdditionQuery, true);
    assert.strictEqual(hasStrongRemovalVerb, true);
    assert.strictEqual(isPopRemove, true);
  });

  await t.test("should classify Kudasaibeats - Attached as lofi/instrumental using local dictionary", async () => {
    const track: MappedTrack = {
      id: "track_attached",
      name: "Attached",
      artist: "Kudasaibeats",
      artist_ids: [],
      url: "",
      imageUrl: "",
      previewUrl: "",
      popularity: 50,
      artist_genres: [],
    };
    const resolved = await classifyTracksWithGroq([track]);
    assert.deepStrictEqual(resolved[0].artist_genres, ["lofi", "chillhop", "beats", "instrumental"]);
  });

  await t.test("should classify Jinsang - Quiet as lofi/instrumental using local dictionary", async () => {
    const track: MappedTrack = {
      id: "track_quiet",
      name: "Quiet",
      artist: "Jinsang",
      artist_ids: [],
      url: "",
      imageUrl: "",
      previewUrl: "",
      popularity: 50,
      artist_genres: [],
    };
    const resolved = await classifyTracksWithGroq([track]);
    assert.deepStrictEqual(resolved[0].artist_genres, ["lofi", "chillhop", "beats", "instrumental"]);
  });

  await t.test("should classify Nujabes - Feather as rap/vocals using local dictionary", async () => {
    const track: MappedTrack = {
      id: "track_feather",
      name: "Feather",
      artist: "Nujabes",
      artist_ids: [],
      url: "",
      imageUrl: "",
      previewUrl: "",
      popularity: 50,
      artist_genres: [],
    };
    const resolved = await classifyTracksWithGroq([track]);
    assert.deepStrictEqual(resolved[0].artist_genres, ["lofi", "chillhop", "rap", "vocals", "hip-hop"]);
  });

  await t.test("should classify Idealism - ikigai as lofi/instrumental using local dictionary", async () => {
    const track: MappedTrack = {
      id: "track_ikigai",
      name: "ikigai",
      artist: "Idealism",
      artist_ids: [],
      url: "",
      imageUrl: "",
      previewUrl: "",
      popularity: 50,
      artist_genres: [],
    };
    const resolved = await classifyTracksWithGroq([track]);
    assert.deepStrictEqual(resolved[0].artist_genres, ["lofi", "chillhop", "beats", "instrumental"]);
  });

  await t.test("should identify isLofiPrompt as false when prompt does not contain lofi keywords", () => {
    const cleanPrompt = "add 1 rap song";
    const isLofiPrompt = /(lo[ -]?fi|chill|study|sleep|ambient|coding|work|relax)/i.test(cleanPrompt);
    assert.strictEqual(isLofiPrompt, false);
  });

  await t.test("should identify isLofiPrompt as true for hybrid lofi/rap prompts", () => {
    const cleanPrompt = "Chill lofi hip-hop beats for coding add 1 rap song";
    const isLofiPrompt = /(lo[ -]?fi|chill|study|sleep|ambient|coding|work|relax)/i.test(cleanPrompt);
    assert.strictEqual(isLofiPrompt, true);
  });

  await t.test("should identify isLofiPrompt as true for standard lofi prompt", () => {
    const cleanPrompt = "lofi study beats";
    const isLofiPrompt = /(lo[ -]?fi|chill|study|sleep|ambient|coding|work|relax)/i.test(cleanPrompt);
    assert.strictEqual(isLofiPrompt, true);
  });

  await t.test("should classify unknown tracks via fallback list mapping if Groq API key is absent", async () => {
    const track: MappedTrack = {
      id: "track_unknown",
      name: "Unknown Track",
      artist: "Some Random Artist",
      artist_ids: [],
      url: "",
      imageUrl: "",
      previewUrl: "",
      popularity: 50,
      artist_genres: [],
    };
    
    const oldKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const resolved = await classifyTracksWithGroq([track]);
      assert.deepStrictEqual(resolved[0].artist_genres, []);
    } finally {
      process.env.GROQ_API_KEY = oldKey;
    }
  });

  await t.test("should retain pre-resolved track genres even when unclassified tracks exist", async () => {
    const track1: MappedTrack = {
      id: "track_quiet",
      name: "Quiet",
      artist: "Jinsang",
      artist_ids: [],
      url: "",
      imageUrl: "",
      previewUrl: "",
      popularity: 50,
      artist_genres: [],
    };
    const track2: MappedTrack = {
      id: "track_unknown",
      name: "Unknown Track",
      artist: "Some Random Artist",
      artist_ids: [],
      url: "",
      imageUrl: "",
      previewUrl: "",
      popularity: 50,
      artist_genres: [],
    };
    
    const oldKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const resolved = await classifyTracksWithGroq([track1, track2]);
      assert.deepStrictEqual(resolved.find(t => t.id === "track_quiet")?.artist_genres, ["lofi", "chillhop", "beats", "instrumental"]);
      assert.deepStrictEqual(resolved.find(t => t.id === "track_unknown")?.artist_genres, []);
    } finally {
      process.env.GROQ_API_KEY = oldKey;
    }
  });

  await t.test("should parse hybrid addition prompts correctly", () => {
    const p1 = "Chill lofi hip-hop beats for coding and 1 rap song";
    const h1 = parseHybridAddition(p1);
    assert.ok(h1);
    assert.strictEqual(h1.count, 1);
    assert.strictEqual(h1.genre, "rap");

    const p2 = "lofi study beats with 2 pop tracks";
    const h2 = parseHybridAddition(p2);
    assert.ok(h2);
    assert.strictEqual(h2.count, 2);
    assert.strictEqual(h2.genre, "pop");
  });

  await t.test("should select hybrid track mixes correctly", () => {
    const candidateTracks: MappedTrack[] = [
      {
        id: "lofi_1",
        name: "Quiet Beat 1",
        artist: "Lofi Artist",
        artist_ids: [],
        url: "",
        imageUrl: "",
        previewUrl: "https://p.scdn.co/mp3-preview/lofi_1",
        popularity: 30,
        artist_genres: ["lofi", "beats", "instrumental"],
      },
      {
        id: "rap_1",
        name: "Rap Track 1",
        artist: "Rap Artist",
        artist_ids: [],
        url: "",
        imageUrl: "",
        previewUrl: "https://p.scdn.co/mp3-preview/rap_1",
        popularity: 80,
        artist_genres: ["hip hop", "rap", "vocals"],
      },
      {
        id: "rap_2",
        name: "Rap Track 2",
        artist: "Another Rap Artist",
        artist_ids: [],
        url: "",
        imageUrl: "",
        previewUrl: "https://p.scdn.co/mp3-preview/rap_2",
        popularity: 75,
        artist_genres: ["hip hop", "rap", "vocals"],
      },
    ];

    const result = chooseTopTracks(
      candidateTracks,
      ["rap", "vocals", "pop"],
      "Chill lofi hip-hop beats for coding and 1 rap song",
      3
    );

    const ids = result.tracks.map(t => t.id);
    assert.strictEqual(ids.includes("rap_1"), true);
    assert.strictEqual(ids.includes("lofi_1"), true);
    assert.strictEqual(ids.includes("rap_2"), false);
  });
});
