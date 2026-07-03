# Crate Digger Architecture & Constraints
## Stack: Next.js App Router, Tailwind, Serverless Functions.

## 1. API Contracts
- Frontend calls `/api/curate` with `POST { prompt: string }`.
- Backend uses `Client Credentials Flow` for Spotify API (Base64 encode ClientID:ClientSecret).
- Backend calls Groq API (`llama-3.1-8b-instant`) with `response_format: { type: "json_object" }`.
- Groq System Prompt MUST translate the user prompt into Spotify features:
  - `seed_genres` (1–3 allowed Spotify genres)
  - `seed_artists` (3–5 recognizable artists matching the vibe)
  - `target_energy`, `target_valence`, `target_danceability` (0.0–1.0)
  - `exclude_keywords` (string array)
- Groq must NEVER pass literal prompt words (e.g. "neon cityscape") to Spotify Search. It translates mood into artists, genres, and audio targets.
- Spotify Recommendations Endpoint (try first): `https://api.spotify.com/v1/recommendations?limit=15&seed_genres=...&target_energy=...&target_valence=...&target_danceability=...`
- Because Recommendations returns 404 in production, the backend falls back to **semantic artist search** (`artist:"Daniel Caesar"` style queries from Groq `seed_artists` + genre reference maps).
- Preview URLs: Spotify Web API `preview_url` is often null with Client Credentials. Backend enriches via Spotify embed page (`open.spotify.com/embed/track/{id}`) to extract `p.scdn.co/mp3-preview/...`. Never use third-party preview hosts.

## 2. The Logic Filter (Crucial)
- Filter tracks whose `name` or `artists[0].name` contains any `exclude_keywords` (case-insensitive).
- Drop keyword-stuffed spam titles that mirror the user prompt (e.g. "Neon Cityscape" for "neon city" prompts).
- Drop low-popularity filler (popularity < 15) and royalty-free style artists.
- Return **top 5** surviving tracks as: `[{ id, name, artist, url, imageUrl, previewUrl, popularity }]`.
- Response also includes `source`, `agent`, `warning`, `excludeKeywords`.

## 3. Strict Edge Cases (Do not crash)
- If Groq fails to return JSON, catch and fallback to default agent output (chill/pop + Frank Ocean, SZA, Khalid).
- If Spotify returns 401, refresh the cached token.
- If filtering leaves 0 tracks, return up to 3 unfiltered tracks with `warning: true`.
- If fewer than 3 tracks have playable Spotify previews, run a second semantic search pass.
