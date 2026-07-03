# AI & API Resilience Rules
1. **Groq Hallucinations:** If Groq fails to return valid JSON, catch the error and fallback to a default JSON object: `{"search_query": "lofi chill", "exclude_keywords": []}` to prevent UI crashes.
2. **Spotify Token Expiry:** The Client Credentials token expires every hour. The server-side fetch must handle 401s or cache the token properly.
3. **Over-filtering:** If the `exclude_keywords` filter removes EVERY track from the Spotify response, return the top 3 unfiltered tracks anyway so the user doesn't see a blank screen, but attach a warning flag.
4. **Rate Limits:** Ensure all API calls are strictly server-side (Next.js Route Handlers) to protect API keys.