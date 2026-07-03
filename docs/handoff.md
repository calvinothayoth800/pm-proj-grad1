# Crate Digger Handoff

Last updated: 2026-07-03

## Project Snapshot

Crate Digger is a Next.js App Router MVP for AI-native Spotify curation. The user enters a natural language vibe prompt, including negative constraints, and the backend should translate that prompt into Spotify-compatible intent before returning a short playlist to the frontend.

Current stack:
- Next.js App Router
- Tailwind CSS
- Groq API for semantic prompt parsing
- Spotify Web API for track retrieval
- Client-side playlist storage in `localStorage`

## Docs Read This Session

- `README.md`: default Next.js starter instructions.
- `docs/prd.md`: product goal and core flow. It now describes Groq returning `seed_genres`, `target_energy`, `target_valence`, `target_danceability`, and `exclude_keywords`.
- `docs/architecture.md`: API contract and backend constraints. It now points to Spotify Recommendations instead of Spotify Search.
- `docs/edge_cases.md`: resilience rules for Groq JSON failure, Spotify token expiry, over-filtering, and server-side API calls.
- Attached continuation notes: clarified that the "late night drive, romantic, not synthy" example is semantic guidance, not a hardcoded case. The AI should infer lower energy, more melodic/vocal direction, and tune Spotify parameters accordingly.

## What Was Already Done Before This Handoff

The worktree already had modified files before this handoff was created:
- `docs/prd.md`
- `docs/architecture.md`
- `app/api/curate/route.ts`

Observed changes:
- Docs were updated from the older Spotify Search flow to a Spotify Recommendations/audio-feature flow.
- `route.ts` was improved with:
  - Spotify client credentials token caching.
  - Groq call using `llama-3.1-8b-instant` with JSON response format.
  - Semantic expansion into `genres`, `artists`, `search_queries`, and `exclude_keywords`.
  - Multiple Spotify Search requests for generated queries, artists, and genres.
  - Deduplication by Spotify track ID.
  - Negative filtering against track name and primary artist.
  - Spam/royalty-free style artist filtering.
  - Popularity-based ranking.
  - Over-filter fallback returning unfiltered tracks with a warning.
  - Response mapping with `id`, `name`, `artist`, `url`, `imageUrl`, `previewUrl`, and `popularity`.

## What Was Done In The First Handoff Session

- Read all markdown docs and the attached continuation text.
- Inspected the current `app/api/curate/route.ts`.
- Inspected frontend expectations in `app/page.tsx`, `components/PlaylistCard.tsx`, `components/PlayerBar.tsx`, and `lib/playlists.ts`.
- Created this handoff file to capture the current state and next steps.

## What Was Done In The Feature Session

- Rewrote `app/api/curate/route.ts` into a semantic curation agent.
- Groq now returns the target schema:
  - `seed_genres`
  - `target_energy`
  - `target_valence`
  - `target_danceability`
  - `exclude_keywords`
- Added server-side validation so invalid Groq genres are dropped before Spotify is called.
- Added numeric clamping for Spotify audio feature targets.
- Added Spotify Recommendations fetch with `market=US`.
- Added a semantic Spotify Search fallback because live testing showed Spotify returns 404 for `/v1/recommendations` in this environment.
- Added fallback reference-artist mappings by genre so fallback results are recognizable songs instead of literal low-quality text matches.
- Added round-robin result merging so fallback playlists are more diverse.
- Fixed two existing frontend lint errors in `app/page.tsx`.
- Updated `docs/architecture.md` to document the Recommendations fallback.

## Current Important Mismatch

The docs now specify the target backend as:

1. Groq returns:
   - `seed_genres`
   - `target_energy`
   - `target_valence`
   - `target_danceability`
   - `exclude_keywords`
2. Backend calls:
   - `https://api.spotify.com/v1/recommendations`

The current `app/api/curate/route.ts` is now aligned with this schema. It attempts Spotify Recommendations first, then falls back to semantic Search if Recommendations is unavailable.

## Desired Backend Direction

Rewrite or refactor `app/api/curate/route.ts` around the semantic Recommendations workflow:

1. Accept `POST { prompt: string }`.
2. Authenticate with Spotify client credentials.
3. Ask Groq to produce only valid JSON:
   - `seed_genres`: comma-separated string of 1 to 3 allowed Spotify seed genres.
   - `target_energy`: number from 0.0 to 1.0.
   - `target_valence`: number from 0.0 to 1.0.
   - `target_danceability`: number from 0.0 to 1.0.
   - `exclude_keywords`: string array.
4. Force Groq to choose `seed_genres` only from a safe allowed list:
   - acoustic, afrobeat, alt-rock, ambient, anime, black-metal, bluegrass, blues, bossanova, chill, classical, club, country, dance, disco, edm, electronic, emo, folk, funk, gospel, goth, grunge, hip-hop, house, indie, j-pop, jazz, k-pop, metal, pop, punk, r-n-b, rock, romance, sad, soul, synth-pop, techno, trance
5. Validate and sanitize Groq output server-side anyway:
   - Clamp numeric targets to `0.0..1.0`.
   - Drop invalid seed genres.
   - Fallback if no valid seed genres remain.
   - Limit total seed genres to 3 to stay below Spotify's 5 combined seed limit.
6. Call Spotify Recommendations with `limit=15`.
7. Filter tracks whose name or primary artist contains any `exclude_keywords`, case-insensitive.
8. Map top 5 tracks to the frontend shape:
   - `id`
   - `name`
   - `artist`
   - `url`
   - `imageUrl`
   - `previewUrl` if available
9. If filtering removes everything, return top 3 unfiltered tracks and `warning: true`.

## Semantic Guidance

Do not hardcode one prompt. The late-night example should be handled through semantic interpretation:
- "late night drive", "down low", "melodic", "romantic" should generally imply lower energy, warmer valence, moderate danceability, and genres such as `r-n-b`, `soul`, `romance`, `chill`, or `acoustic`.
- "not synthy", "no synthwave", "no electronic", or similar should add appropriate `exclude_keywords` like `synth`, `synthwave`, `electronic`, `edm`, `techno`, `instrumental`, or `beats`.
- Similar prompts should generalize instead of matching exact strings.

## Verification Completed

`npm run lint` passes with 0 errors. Existing warnings remain for custom fonts and `<img>` usage.

The running dev server was already active on `http://localhost:3000`.

Test request:

```bash
curl -X POST http://localhost:3000/api/curate \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"late night drive, romantic and melodic, not synthy, no loud pop\"}"
```

Observed response:
- HTTP 200.
- `source: "search_fallback"` because Recommendations returned 404.
- Groq inferred `seed_genres: "r-n-b,soul,romance"`.
- Groq inferred low-to-moderate energy and excluded synth/electronic/EDM/techno/loud/pop.
- Returned recognizable on-vibe tracks including Daniel Caesar, GIVĒON, SZA, and Frank Ocean.

Additional prompts tested:
- `"energetic dance music for working out, no sad acoustic songs"` produced high-energy dance/EDM semantics and recognizable tracks including Dua Lipa, Calvin Harris, and David Guetta.
- `"warm acoustic folk for a rainy morning, no heavy metal"` produced folk/acoustic/chill semantics and avoided metal.

## Open Risks

- Spotify Recommendations is deprecated and returned 404 in live testing, so Search fallback is currently carrying the feature.
- Spotify genre seeds are strict; invalid seeds cause 400 responses.
- Groq can still return malformed or semantically poor JSON despite `response_format`.
- Spotify preview URLs may be null for many tracks, so the existing audio preview fallback may still be needed.
- Frontend currently expects `tracks` and then stores playlists in `localStorage`; response shape must remain compatible.

## Suggested Next Task

Tune the fallback reference mappings and optional debug output after more real prompt testing. If Spotify removes Recommendations permanently, consider making semantic Search the documented primary path while keeping the same Groq audio-feature schema.
