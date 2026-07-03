# Crate Digger Handoff

Last updated: 2026-07-03 (deploy fix session)

## Deploy Blocker Resolved

Vercel (`pm-proj-grad1.vercel.app`) was still serving **old** `/api/curate` code (response had `searchQuery`, SoundHelix previews, 8 keyword-spam tracks). All fixes were local-only until this commit.

## Latest Changes (This Commit)

- Semantic Groq pipeline with `seed_artists` — no literal prompt → Spotify Search
- Anti-spam filters: keyword-stuffed titles ("Neon Cityscape"), popularity floor, filler artist blocklist
- Spotify embed preview enrichment (`p.scdn.co/mp3-preview`) — SoundHelix blocked
- Returns **5 tracks** per PRD (not 8)
- `PlayerContext` audio teardown fix for same-song bug
- `docs/architecture.md` aligned with PRD

## Neon City Prompt Test (Local, Post-Fix)

`"Late night driving through a neon city"` → genres: `electronic,synth-pop,chill`; artists: The Weeknd, Kavinsky, M83; tracks include Kavinsky, The Midnight, Frank Ocean, Daniel Caesar (not "Neon Cityscape" spam).

## Project Snapshot

Crate Digger is a Next.js App Router MVP for AI-native Spotify curation. The user enters a natural language vibe prompt, including negative constraints, and the backend translates that prompt into Spotify-compatible intent before returning a short playlist to the frontend.

Current stack:
- Next.js App Router
- Tailwind CSS
- Groq API (`llama-3.1-8b-instant`) for semantic prompt parsing
- Spotify Web API (Client Credentials) for track metadata and search
- Spotify embed page (`open.spotify.com/embed/track/{id}`) for preview MP3 URLs when the API returns `preview_url: null`
- Client-side playlist storage in `localStorage`

## Active User Issues (This Session)

1. **Recommendation engine felt broken** — playlists were generic, often synthy/spammy, and not semantically matched to prompts like "late night drive, romantic and melodic, not synthy".
2. **Same song on first track** — creating a new playlist often played the same audio for track 1 even when cover/title differed. Root cause was missing Spotify preview URLs plus stale HTML5 audio behavior.

## Root Causes Confirmed By Live Testing

| Layer | Finding |
|-------|---------|
| Spotify `/v1/recommendations` | Returns **404** in this environment (deprecated/unavailable on current API tier). |
| Spotify `/v1/audio-features` | Returns **403 Forbidden**. |
| Spotify `/v1/artists/{id}/top-tracks` | Returns **403 Forbidden**. |
| Spotify Search (`/v1/search`) | **Works** with Client Credentials. |
| Spotify `preview_url` on Search/Tracks API | Returns **`null`/undefined** for virtually all tracks with Client Credentials. |
| Spotify embed page | **Works** — HTML contains `https://p.scdn.co/mp3-preview/...` URLs for the actual Spotify 30s clip. |

**Important:** This is not a missing Client ID/Secret problem. Credentials work for search. The gap is that Spotify no longer exposes `preview_url` through the Web API for this auth mode, but the embed page still serves the official Spotify preview MP3.

## Why iTunes Was Briefly Added (And Removed)

During debugging, iTunes Search API was used as a temporary workaround to get *any* playable 30s audio when Spotify API `preview_url` was null. The user correctly pushed back: the product is Spotify-themed and should stay Spotify-native.

**Current decision:** Remove iTunes entirely. Resolve previews from Spotify embed pages instead (`p.scdn.co/mp3-preview/...`). Tracks, artwork, artist names, and Spotify URLs all remain from the Spotify Web API.

## Architecture (Current Target)

```
User prompt
    → Groq (translation layer)
        → seed_genres, seed_artists, target_energy, target_valence, target_danceability, exclude_keywords
    → Spotify Recommendations (try first, expect 404)
    → Fallback: semantic artist search on Spotify
        → queries like artist:"Daniel Caesar" (NOT raw prompt text like "late night drive")
        → Groq seed_artists + genre reference artist map
        → round-robin merge + dedupe
    → Filter filler/spam + exclude_keywords
    → Enrich previews via Spotify embed scrape per track ID
    → Return top 5 tracks to frontend
```

### Why NOT raw prompt → Spotify Search

Spotify Search is keyword-only. Sending "late night drive" matches titles containing those words → royalty-free synthwave spam. Groq must translate vibes into artists/genres/audio targets; search must use **artist seeds**, not literal mood strings.

## Files Changed This Session

### `app/api/curate/route.ts` (major rewrite in progress)
- Groq schema extended with `seed_artists` (3–5 recognizable artists per vibe).
- Semantic search fallback uses **artist-only queries** (removed literal prompt / "late night {genre}" queries).
- Stronger filler filtering (generic titles like "EDM Dance", low-popularity spam artists).
- `chooseTopTracks` prefers tracks with `previewUrl`, shuffles for diversity, dedupes artists.
- Fixed Spotify search `limit` bug (`limit=12` caused 400 Invalid limit; max is 10).
- **Preview enrichment:** `lookupSpotifyEmbedPreview(trackId)` fetches embed HTML and extracts `p.scdn.co/mp3-preview/...`.
- Removed iTunes preview lookup (per user request).
- Second-pass search if fewer than 3 playable tracks after enrichment.

### `context/PlayerContext.tsx`
- Proper audio teardown (`pause`, clear `src`, `load()`) when switching tracks.
- Auto-skip to next queue item that has a `previewUrl` if the requested track has none.

### `scripts/test-spotify-preview.mjs` (dev-only)
- Confirms embed page returns Spotify `mp3-preview` URLs for test track IDs.

## Groq Output Schema (Current)

```json
{
  "seed_genres": "r-n-b,soul,romance",
  "seed_artists": ["Daniel Caesar", "Giveon", "Snoh Aalegra"],
  "target_energy": 0.3,
  "target_valence": 0.4,
  "target_danceability": 0.5,
  "exclude_keywords": ["synthwave", "edm", "electronic"]
}
```

## Verification Done So Far

Dev server: `http://localhost:3000`

### API tests — **PASSING after Spotify embed preview swap** (2026-07-03 evening)

All previews are `https://p.scdn.co/mp3-preview/...` (Spotify-native, no iTunes).

| Prompt | Playable | Sample tracks |
|--------|----------|---------------|
| late night drive, romantic and melodic, not synthy | 5/5 | H.E.R., Leon Bridges, Frank Ocean, SZA |
| energetic dance music for working out | 5/5 | Disclosure, Calvin Harris, The Chainsmokers |
| warm acoustic folk for a rainy morning | 5/5 | The Lumineers, Hozier, Cleopatra |

**Diversity test** (same late-night prompt × 3): first-track IDs all unique — Frank Ocean, Leon Bridges, Daniel Caesar.

### Earlier debugging notes
- Search `limit=12` caused 400 Invalid limit → fixed to `limit=10`.
- Literal prompt search ("late night drive") caused synth spam → fixed with artist-only semantic search.
- iTunes briefly used for previews → **removed** per user; replaced with Spotify embed scrape.

### Spotify embed preview test
```bash
node scripts/test-spotify-preview.mjs
```
- `2ZWlPOoWh0626oTaHrnl2a` (Frank Ocean – Ivy) → `https://p.scdn.co/mp3-preview/3eb4d77b...`

## Still To Verify (Next Agent Should Run)

1. ~~Re-test `/api/curate` after iTunes → Spotify embed swap~~ **DONE — passing**
2. Browser test: curate a playlist, confirm player bar plays the **correct** track audio (not stale SoundHelix mock from `DEFAULT_PLAYLISTS`).
3. ~~Run `npm run lint`~~ **DONE** — 0 errors, 7 pre-existing warnings (fonts/img).
4. Update `docs/architecture.md` to document:
   - Recommendations 404 → semantic artist search primary path
   - Spotify embed preview enrichment
   - `seed_artists` in Groq schema

## Open Risks

- Spotify embed scraping is unofficial; could break if embed HTML changes. Fallback: Spotify iframe player in `PlayerBar` (heavier UI change).
- Embed preview fetch is sequential (one request per track) — may add latency; consider caching or parallelizing with rate-limit care.
- Groq can still hallucinate bad seed artists for niche prompts.
- `DEFAULT_PLAYLISTS` in `lib/playlists.ts` still use SoundHelix mock MP3s — unrelated to curated playlists but can confuse testing if user plays featured playlists first.

## Suggested Next Steps

1. Finish verification loop (API + browser) after Spotify embed preview merge.
2. If embed previews are slow, add simple in-memory cache keyed by Spotify track ID.
3. Document final architecture in `docs/architecture.md`.
4. Only mark feature complete when: diverse playlists per prompt, semantically on-vibe tracks, and in-app playback uses the selected Spotify track's preview.
