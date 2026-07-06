import * as fs from "fs";
import * as path from "path";

// Templates to generate permutations and combinations
const vibes = [
  "chill", "lofi", "relaxing", "energetic", "heavy", "spacious", "warm", "dark",
  "happy", "sad", "melancholy", "nocturnal", "uplifting", "calm", "smooth", "atmospheric"
];

const subgenres = [
  "beats", "hip-hop", "techno", "house", "ambient", "folk", "acoustic", "pop",
  "rock", "metal", "synthwave", "dance", "edm", "indie", "jazz", "soul", "r&b"
];

const contexts = [
  "for coding", "for studying", "for working out", "for driving", "on a rainy day",
  "for sleep", "to relax", "while reading", "for a neon city", "for gaming",
  "during morning coffee", "for running", "while focusing", "for a dinner party"
];

const negativeSemantics = [
  "no vocals", "no rap", "without pop", "excluding edm", "no high energy",
  "with no singing", "excluding hip-hop", "avoid metal", "no country music",
  "without vocals", "no voice", "instrumental only", "don't play Drake",
  "exclude Taylor Swift", "avoid rock", "no heavy beats", "without mainstream pop"
];

const editCommands = [
  "add 3 lofi beats", "remove all rock", "replace with synthwave", "keep only instrumental",
  "add 1 rap song", "delete high energy tracks", "make it more chill", "add some folk songs",
  "swap the pop tracks for techno", "add a song by Norah Jones", "remove Taylor Swift",
  "make the vibe darker", "add a few calm acoustic tracks", "remove the vocal songs"
];

const typos = [
  "lofy", "codeing", "relaxxxing", "enrgetic", "ambientt", "workin out", "studing",
  "acustic", "sythwave", "techo", "hiphop beats", "nocutrnal", "no vocals plz"
];

function generate1000Prompts(): string[] {
  const promptsSet = new Set<string>();

  // 1. Permutations of Vibe + Subgenre + Context (Positive Semantics)
  for (const v of vibes) {
    for (const sg of subgenres) {
      for (const c of contexts) {
        promptsSet.add(`${v} ${sg} ${c}`);
        if (promptsSet.size >= 1000) break;
      }
      if (promptsSet.size >= 1000) break;
    }
    if (promptsSet.size >= 1000) break;
  }

  // 2. Permutations of Vibe + Subgenre + Context + Exclusions (Negative Semantics)
  for (const v of vibes) {
    for (const sg of subgenres) {
      for (const neg of negativeSemantics) {
        promptsSet.add(`${v} ${sg} ${neg}`);
        promptsSet.add(`${v} ${sg} for studying ${neg}`);
        if (promptsSet.size >= 1000) break;
      }
      if (promptsSet.size >= 1000) break;
    }
    if (promptsSet.size >= 1000) break;
  }

  // 3. Permutations of Edit Commands + Exclusions
  for (const edit of editCommands) {
    for (const neg of negativeSemantics) {
      promptsSet.add(`${edit} and ${neg}`);
      if (promptsSet.size >= 1000) break;
    }
    if (promptsSet.size >= 1000) break;
  }

  // 4. Permutations of Typos + Vibe + Exclusions
  for (const typo of typos) {
    for (const sg of subgenres) {
      for (const neg of negativeSemantics) {
        promptsSet.add(`${typo} ${sg} ${neg}`);
        if (promptsSet.size >= 1000) break;
      }
      if (promptsSet.size >= 1000) break;
    }
    if (promptsSet.size >= 1000) break;
  }

  // 5. Edge cases & Contradictory prompts
  const contradictory = [
    "energetic lofi with no electronic elements",
    "calm techno workout music",
    "silent heavy metal beats",
    "acoustic electronic dance music",
    "slow fast hiphop beats",
    "happy melancholy lofi study",
    "vocal instrumental acoustic folk",
    "heavy dark quiet study beats"
  ];
  for (const cond of contradictory) {
    promptsSet.add(cond);
  }

  // Backfill up to 1000 if not reached
  let index = 0;
  while (promptsSet.size < 1000) {
    promptsSet.add(`Vibe check ${index}: chill lofi beats with no rap`);
    index++;
  }

  return Array.from(promptsSet).slice(0, 1000);
}

const list = generate1000Prompts();
const filePath = path.join(__dirname, "probable-prompts.txt");
fs.writeFileSync(filePath, list.join("\n"), "utf8");
console.log(`Generated ${list.length} prompts in ${filePath}`);
