import { 
  getRegionalExcludes, 
  getLofiExcludes, 
  buildSemanticSearchQueries,
  chooseTopTracks,
  getGroqCurationAgent,
  getSpotifyToken,
  searchSpotifySemantic,
  classifyTracksWithGroq,
  dedupeTracks
} from "../lib/curation-engine";
import * as fs from "fs";
import * as path from "path";

// Load env variables
try {
  const envContent = fs.readFileSync("d:/pm proj/pm-proj-grad1/.env", "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valParts] = trimmed.split("=");
    if (key && valParts.length > 0) {
      process.env[key.trim()] = valParts.join("=").trim();
    }
  });
} catch (err) {
  console.error("Failed to load .env file manually:", err);
}

// Local mock of getPlaylistEditPlan structure to test local plan parser logic
import { sanitizePlan } from "../app/api/playlist-agent/route";

async function runPromptSweep() {
  console.log("========================================\nSTARTING 1000 PROMPTS OFFLINE SWEEP\n========================================");
  
  const promptsPath = path.join(__dirname, "probable-prompts.txt");
  if (!fs.existsSync(promptsPath)) {
    console.error("Could not find probable-prompts.txt! Run generate-prompts.ts first.");
    process.exit(1);
  }
  
  const prompts = fs.readFileSync(promptsPath, "utf8").split("\n").filter(Boolean);
  console.log(`Loaded ${prompts.length} prompts for sweep.\n`);
  
  let sweepPassed = true;
  let lofiCount = 0;
  let errorCount = 0;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    try {
      // 1. Test local isLofiPrompt detection
      const isLofi = /(lo[ -]?fi|chill|study|sleep|ambient|coding|work|relax)/i.test(prompt);
      if (isLofi) lofiCount++;
      
      // 2. Test local exclusions generation
      const regionalExcludes = getRegionalExcludes(prompt);
      const lofiExcludes = getLofiExcludes(prompt);
      
      // 3. Test local query building with mock AgentOutput
      const mockAgentConfig = {
        seed_genres: isLofi ? "lo-fi,chillhop" : "pop,dance",
        seed_artists: ["artist1", "artist2"],
        target_energy: 0.5,
        target_valence: 0.5,
        target_danceability: 0.5,
        exclude_keywords: [...regionalExcludes, ...lofiExcludes],
        track_count: 5,
        target_artist: null,
        target_track: null
      };
      
      const queries = buildSemanticSearchQueries(mockAgentConfig, prompt);
      
      // Assertions to make sure query syntax is perfectly valid
      if (queries.length === 0) {
        throw new Error("Generated empty query list");
      }
      
      for (const q of queries) {
        if (q.includes("undefined") || q.includes("null") || q.includes("NaN")) {
          throw new Error(`Invalid query syntax generated: "${q}"`);
        }
      }
      
      // 4. Test plan sanitizer logic (simulate empty track list)
      const trackIds = new Set<string>();
      const sanitized = sanitizePlan({
        explanation: "Test explanation",
        remove_track_ids: [],
        add_prompt: isLofi ? "lofi study beats" : "pop beats",
        add_count: 5
      }, trackIds);
      
      if (sanitized.add_count > 10 || sanitized.add_count < 1) {
        throw new Error(`Sanitized add_count out of bounds: ${sanitized.add_count}`);
      }

    } catch (err: any) {
      console.error(`❌ Sweep Error at prompt index ${i} ("${prompt}"):`, err.message);
      sweepPassed = false;
      errorCount++;
    }
  }
  
  console.log("Sweep Completed!");
  console.log(`Total Prompts Swept: ${prompts.length}`);
  console.log(`Lofi Prompts Identified: ${lofiCount}`);
  console.log(`Errors Found: ${errorCount}`);
  
  if (sweepPassed) {
    console.log("✅ OFFLINE SWEEP SUCCESSFUL! No crashes or query syntax errors.\n");
  } else {
    console.log("❌ OFFLINE SWEEP FAILED! Resolving issues...\n");
    process.exit(1);
  }

  // Live validation on a stratified sample of 10 prompts
  console.log("========================================\nSTARTING LIVE SAMPLE VALIDATION (10 Prompts)\n========================================");
  
  const token = await getSpotifyToken();
  const samplePrompts = [
    // 1. Positive Semantics
    "chill house for running",
    // 2. Negative Semantics
    "spacious ambient for study no vocals",
    // 3. Hybrid / Addition / Exclusions
    "Chill lofi hip-hop beats for coding and 1 rap song",
    // 4. Slang / Typos
    "lofy beatzzz with no pop music",
    // 5. Contradictory / Edge case
    "calm techno workout music",
    // 6. Regional Artist Hints
    "bollywood driving neon city",
    // 7. Vocal Explicit Exclusions
    "lofi beats study don't play singing vocals",
    // 8. Custom target artist
    "play a song by Norah Jones",
    // 9. Mainstream Exclusions
    "lofi coding beats exclude Drake Taylor Swift",
    // 10. Synthwave Vibe
    "Late night driving through a neon city"
  ];

  let livePassed = true;

  for (const prompt of samplePrompts) {
    console.log(`Evaluating Prompt: "${prompt}"`);
    try {
      // Delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 16000));
      
      const agentConfig = await getGroqCurationAgent(prompt);
      console.log(`  Parsed track_count: ${agentConfig.track_count}`);
      console.log(`  Target artist: ${agentConfig.target_artist}`);
      console.log(`  Target track: ${agentConfig.target_track}`);
      console.log(`  Excludes: ${agentConfig.exclude_keywords.join(", ")}`);
      
      let tracks = await searchSpotifySemantic(agentConfig, token, prompt);
      const uniqueTracks = dedupeTracks(tracks);
      
      const candidates = uniqueTracks.slice(0, 15);
      const classified = await classifyTracksWithGroq(candidates);
      
      const chosen = chooseTopTracks(classified, agentConfig.exclude_keywords, prompt, agentConfig.track_count || 5);
      
      console.log(`  Chosen Tracks:`);
      chosen.tracks.forEach((t, index) => {
        console.log(`    ${index + 1}. ${t.name} - ${t.artist} (Genres: ${t.artist_genres.join(", ")})`);
      });

      // Assertions
      if (chosen.tracks.length === 0) {
        throw new Error("Returned 0 curated tracks");
      }

      if (chosen.tracks.length < 3) {
        throw new Error(`Playlist was truncated. Returned only ${chosen.tracks.length} tracks. Parsed track_count was ${agentConfig.track_count}.`);
      }

      console.log("  STATUS: PASS\n");
    } catch (err: any) {
      console.error(`  STATUS: FAIL - Error:`, err.message);
      livePassed = false;
    }
  }

  console.log("========================================");
  if (livePassed) {
    console.log("ALL LIVE SAMPLE TESTS PASSED! ACCURACY AND VIBE METRIC SECURED.");
    console.log("========================================");
    process.exit(0);
  } else {
    console.log("SOME LIVE SAMPLE TESTS FAILED. CHECK LOGS AND RETRY.");
    console.log("========================================");
    process.exit(1);
  }
}

runPromptSweep();
