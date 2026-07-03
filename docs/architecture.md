# Crate Digger Architecture & Constraints
## Stack: Next.js App Router, Tailwind, Serverless Functions.

## 1. API Contracts
- Frontend calls `/api/curate` with `POST { prompt: string }`.
- Backend uses `Client Credentials Flow` for Spotify API (Base64 encode ClientID:ClientSecret).
- Backend calls Groq API (`llama-3.1-8b-instant`) with `response_format: { type: "json_object" }`.
- Groq System Prompt MUST translate the user prompt into Spotify features: `{ "seed_genres": "string", "target_energy": number, "target_valence": number, "target_danceability": number, "exclude_keywords": ["string"] }`.
- Spotify Recommendations Endpoint: `https://api.spotify.com/v1/recommendations?limit=15&seed_genres={seed_genres}&target_energy={target_energy}&target_valence={target_valence}&target_danceability={target_danceability}`
- Because Spotify currently marks Recommendations as deprecated and this environment returns 404 for it, the backend MUST gracefully fall back to semantic Spotify Search queries derived from the validated agent output.

## 2. The Logic Filter (Crucial)
- The backend MUST filter the Spotify tracks. If a track's `name` or `artists[0].name` contains ANY word from `exclude_keywords` (case-insensitive), drop it.
- Return top 5 surviving tracks as: `[{ id, name, artist, url }]`.

## 3. Strict Edge Cases (Do not crash)
- If Groq fails to return JSON, catch and fallback to: `search_query: prompt.substring(0,20), exclude_keywords: []`.
- If Spotify returns 401, token is invalid. 
- If filtering leaves 0 tracks, return the first 3 unfiltered tracks so the UI doesn't blank out.
