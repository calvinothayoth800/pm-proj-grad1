# Project: Crate Digger MVP
# Goal: An AI-native Spotify curation tool that uses semantic intent to bypass 'Niche Bleed' and 'Popularity Bias'.
# Stack: Next.js (App Router), Tailwind CSS, Lucide React, Groq API (llama3-8b-8192), Spotify Web API.

## Core Flow
1. User enters a natural language prompt with negative constraints (e.g., "90s goth rock, NO mainstream pop").
2. Backend passes prompt to Groq. Groq returns JSON with `search_query` and `exclude_keywords`.
3. Backend fetches Spotify Search API using the `search_query`.
4. Backend filters out any Spotify results containing `exclude_keywords`.
5. Frontend renders top 5 surviving tracks using Spotify Embed iframes.