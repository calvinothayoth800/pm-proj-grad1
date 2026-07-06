import { 
  getGroqCurationAgent, 
  buildSemanticSearchQueries, 
  getSpotifyToken, 
  searchSpotifySemantic,
  classifyTracksWithGroq,
  dedupeTracks,
  chooseTopTracks,
  getRegionalExcludes,
  getLofiExcludes,
  sanitizeKeywords,
  injectArtistGenres
} from "../lib/curation-engine";
import * as fs from "fs";

// Load environment variables manually
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

interface TestVibe {
  prompt: string;
  expectedCount: number;
  validator: (tracks: any[]) => { passed: boolean; reason: string; matches: number };
}

const CHIPS_TO_TEST: TestVibe[] = [
  {
    prompt: "Late night driving through a neon city",
    expectedCount: 5,
    validator: (tracks) => {
      const matchCriteria = (t: any) => {
        const title = t.name.toLowerCase();
        const artist = t.artist.toLowerCase();
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        
        const electronicKeywords = ["synth-pop", "electronic", "synthwave", "chill", "ambient", "indie", "house", "pop", "club", "trance", "dance", "synth"];
        const hasVibeGenre = genres.some((g: string) => electronicKeywords.some(kw => g.includes(kw)));
        const hasVibeWord = /(night|neon|city|drive|driving|midnight|dark|street|light|sunset|car)/i.test(title + " " + artist);
        
        return hasVibeGenre || hasVibeWord;
      };
      
      const matches = tracks.filter(matchCriteria).length;
      return {
        passed: matches >= 4,
        reason: `${matches}/${tracks.length} tracks matched electronic, synth, indie, or night theme.`,
        matches
      };
    }
  },
  {
    prompt: "Chill lofi hip-hop beats for coding",
    expectedCount: 5,
    validator: (tracks) => {
      const matchCriteria = (t: any) => {
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        const hasLofiGenre = genres.some((g: string) => 
          g.includes("lo-fi") || g.includes("lofi") || g.includes("chillhop") || 
          g.includes("beats") || g.includes("study") || g.includes("ambient") || g.includes("instrumental")
        );
        const hasVocals = genres.some((g: string) => g.includes("vocals") || g.includes("singing") || g.includes("singer") || g.includes("rap"));
        
        return hasLofiGenre && !hasVocals;
      };
      
      const matches = tracks.filter(matchCriteria).length;
      return {
        passed: matches >= 4,
        reason: `${matches}/${tracks.length} tracks matched instrumental lofi/study vibe.`,
        matches
      };
    }
  },
  {
    prompt: "Energetic dance music for working out",
    expectedCount: 5,
    validator: (tracks) => {
      const matchCriteria = (t: any) => {
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        const danceKeywords = ["dance", "edm", "electronic", "house", "techno", "club", "trance", "pop", "synth-pop", "afrobeat", "funk"];
        return genres.some((g: string) => danceKeywords.some(kw => g.includes(kw)));
      };
      
      const matches = tracks.filter(matchCriteria).length;
      return {
        passed: matches >= 4,
        reason: `${matches}/${tracks.length} tracks matched high energy dance, house, or techno.`,
        matches
      };
    }
  },
  {
    prompt: "Warm acoustic folk for a rainy morning",
    expectedCount: 5,
    validator: (tracks) => {
      const matchCriteria = (t: any) => {
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        const acousticKeywords = ["acoustic", "folk", "indie", "bossanova", "chill", "blues", "singer-songwriter", "soul", "romance", "sad"];
        return genres.some((g: string) => acousticKeywords.some(kw => g.includes(kw)));
      };
      
      const matches = tracks.filter(matchCriteria).length;
      return {
        passed: matches >= 4,
        reason: `${matches}/${tracks.length} tracks matched acoustic, folk, indie or warm/chill vibes.`,
        matches
      };
    }
  },
  {
    prompt: "Heavy dark industrial techno beats",
    expectedCount: 5,
    validator: (tracks) => {
      const matchCriteria = (t: any) => {
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        const technoKeywords = ["techno", "industrial", "electronic", "edm", "trance", "club", "metal", "goth", "dark", "house", "dance"];
        return genres.some((g: string) => technoKeywords.some(kw => g.includes(kw)));
      };
      
      const matches = tracks.filter(matchCriteria).length;
      return {
        passed: matches >= 4,
        reason: `${matches}/${tracks.length} tracks matched dark techno, industrial, or electronic beats.`,
        matches
      };
    }
  },
  {
    prompt: "Spacious ambient soundscapes for study",
    expectedCount: 5,
    validator: (tracks) => {
      const matchCriteria = (t: any) => {
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        const ambientKeywords = ["ambient", "chill", "study", "classical", "bossanova", "instrumental", "soundscape", "drone", "calm", "sleep"];
        const hasVocals = genres.some((g: string) => g.includes("vocals") || g.includes("singing") || g.includes("singer") || g.includes("rap"));
        return genres.some((g: string) => ambientKeywords.some(kw => g.includes(kw))) && !hasVocals;
      };
      
      const matches = tracks.filter(matchCriteria).length;
      return {
        passed: matches >= 4,
        reason: `${matches}/${tracks.length} tracks matched spacious ambient or study instrumental soundscapes.`,
        matches
      };
    }
  },
  {
    prompt: "Chill lofi hip-hop beats for coding add 1 rap song",
    expectedCount: 6,
    validator: (tracks) => {
      const lofiBeats = tracks.filter((t: any) => {
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        return genres.some((g: string) => g.includes("lofi") || g.includes("lo-fi") || g.includes("chillhop") || g.includes("beats") || g.includes("study") || g.includes("instrumental"))
          && !genres.some((g: string) => g.includes("rap") || g.includes("vocals"));
      });
      
      const rapSongs = tracks.filter((t: any) => {
        const genres = t.artist_genres.map((g: string) => g.toLowerCase());
        const nameAndArtist = (t.name + " " + t.artist).toLowerCase();
        return genres.some((g: string) => g.includes("rap") || g.includes("hip-hop") || g.includes("vocals"))
          || nameAndArtist.includes("feat.") || nameAndArtist.includes("ft.") || nameAndArtist.includes("featuring");
      });
      
      const pass = lofiBeats.length >= 4 && rapSongs.length >= 1;
      
      return {
        passed: pass,
        reason: `Found ${lofiBeats.length} lofi beats and ${rapSongs.length} rap/vocal songs.`,
        matches: lofiBeats.length + (rapSongs.length > 0 ? 1 : 0)
      };
    }
  }
];

async function runTests() {
  console.log("========================================");
  console.log("RUNNING EXPLORE CHIPS ACCURACY TEST");
  console.log("========================================\n");

  const token = await getSpotifyToken();
  let overallPassed = true;

  for (const test of CHIPS_TO_TEST) {
    console.log(`Testing Prompt: "${test.prompt}"`);
    
    try {
      const agentConfig = await getGroqCurationAgent(test.prompt);
      
      // Inject standard exclusions
      agentConfig.exclude_keywords = sanitizeKeywords([
        ...agentConfig.exclude_keywords,
        ...getRegionalExcludes(test.prompt),
        ...getLofiExcludes(test.prompt),
      ]);

      const promptLower = test.prompt.toLowerCase();
      if (promptLower.includes("rap") || promptLower.includes("hiphop") || promptLower.includes("hip-hop")) {
        agentConfig.exclude_keywords = agentConfig.exclude_keywords.filter(
          k => !["rap", "hip hop", "hiphop"].includes(k.toLowerCase())
        );
      }

      // Wait to respect Groq RPM and TPM rate limits
      await new Promise((resolve) => setTimeout(resolve, 16000));

      let tracks = await searchSpotifySemantic(agentConfig, token, test.prompt);
      let uniqueTracks = dedupeTracks(tracks);
      
      const tracksToClassify = uniqueTracks.slice(0, 15);
      const resolvedTracks = await injectArtistGenres(tracksToClassify, token);
      const classifiedTracks = await classifyTracksWithGroq(resolvedTracks);

      const chosen = chooseTopTracks(classifiedTracks, agentConfig.exclude_keywords, test.prompt, test.expectedCount);
      
      console.log(`  Selected Tracks:`);
      chosen.tracks.forEach((t, i) => {
        console.log(`    ${i + 1}. ${t.name} - ${t.artist} (Genres: ${t.artist_genres.join(", ")})`);
      });

      const result = test.validator(chosen.tracks);
      console.log(`  Accuracy Result: ${result.matches}/${test.expectedCount} match the vibe.`);
      console.log(`  Reason: ${result.reason}`);
      
      if (result.passed) {
        console.log("  STATUS: PASS\n");
      } else {
        console.log("  STATUS: FAIL\n");
        overallPassed = false;
      }
      
    } catch (err) {
      console.error(`  Error running prompt "${test.prompt}":`, err);
      overallPassed = false;
    }
  }

  console.log("========================================");
  if (overallPassed) {
    console.log("ALL TESTS PASSED! ACCURACY >= 80% (4/5) FOR ALL CHIPS.");
    console.log("========================================");
    process.exit(0);
  } else {
    console.log("SOME TESTS FAILED TO ACHIEVE 4/5 ACCURACY. IDEATION REQUIRED.");
    console.log("========================================");
    process.exit(1);
  }
}

runTests();
