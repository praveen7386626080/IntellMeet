IntellMeet backend update — AI meeting summaries

Changes:
- Improved the Ollama prompt for concise summaries, evidence-based decisions, and actionable tasks.
- Validates, trims, deduplicates, and limits generated summary lists before saving to MongoDB.
- Keeps the existing API endpoints and Meeting schema compatible with the current frontend.

Apply:
1. Back up your current backend folder.
2. Extract this archive.
3. Copy the included src/routes/meetings.ts into your existing backend/src/routes/meetings.ts.
   You can copy the whole src folder if you have no other local changes, but replacing only this file is safer.
4. Keep your existing backend/.env file; this archive intentionally does not include it.
5. In backend/.env, make sure Ollama settings are present:
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=qwen2.5:3b
   Change OLLAMA_MODEL to a model you have actually pulled with Ollama.
6. Make sure Ollama is running and the configured model is available.
7. From backend, run npm run dev.

Endpoint:
POST /api/meetings/:id/summary
Requires the same Bearer-token authentication as the existing meetings API.
The meeting must belong to the signed-in user and have a saved transcript.

Build note:
The uploaded project's TypeScript configuration failed in this environment before compiling the source:
TS5103: Invalid value for '--ignoreDeprecations'.
This is a TypeScript/compiler configuration mismatch, not a reported error in the modified route. Fix the local TypeScript version/configuration before relying on a production build.
