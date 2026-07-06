import * as fs from "fs";
import * as path from "path";

// Templates to generate hybrid prompts (playlist AND additions)
const vibes = [
  "chill lofi", "relaxing study", "energetic workout", "nocturnal driving",
  "spacious ambient", "warm acoustic", "heavy dark industrial", "happy upbeat",
  "sad melancholic", "smooth jazzy", "coding lofi", "rainy day folk",
  "late night neon city", "morning coffee chill", "summer dance party", "ambient coding"
];

const mainGenres = [
  "beats", "techno", "house", "folk", "acoustic", "pop", "rock", "metal",
  "synthwave", "dance", "edm", "indie", "jazz", "soul", "r&b", "bollywood"
];

const additions = [
  "1 rap song", "2 pop tracks", "1 rock song", "2 techno beats", "1 acoustic song",
  "1 hip-hop track", "2 country songs", "1 metal song", "1 folk tune", "2 synthwave tracks",
  "1 jazz track", "1 soul song", "1 r&b song", "2 dance songs", "1 edm track"
];

const connectors = [
  "and", "with", "but add", "plus", "along with", "including", "and also"
];

function generate1000HybridPrompts(): string[] {
  const promptsSet = new Set<string>();

  for (const v of vibes) {
    for (const g of mainGenres) {
      for (const conn of connectors) {
        for (const add of additions) {
          promptsSet.add(`${v} ${g} ${conn} ${add}`);
          if (promptsSet.size >= 1000) break;
        }
        if (promptsSet.size >= 1000) break;
      }
      if (promptsSet.size >= 1000) break;
    }
    if (promptsSet.size >= 1000) break;
  }

  // Backfill up to 1000 if not reached
  let index = 0;
  while (promptsSet.size < 1000) {
    promptsSet.add(`chill lofi beats for coding and 1 rap song #${index}`);
    index++;
  }

  return Array.from(promptsSet).slice(0, 1000);
}

const list = generate1000HybridPrompts();
const filePath = path.join(__dirname, "probable-prompts.txt");
fs.writeFileSync(filePath, list.join("\n"), "utf8");
console.log(`Generated ${list.length} hybrid prompts in ${filePath}`);
