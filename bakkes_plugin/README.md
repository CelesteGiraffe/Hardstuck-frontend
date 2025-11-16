# BakkesMod Plugin Integration Guide

This document is for the developer building the Rocket League Training Journal BakkesMod plugin. It describes how the plugin talks to the local API and what UI patterns you can rely on when reporting matches, favorites, and training data.

## Architecture at a Glance

- **`api/`** is a small Express + SQLite server that holds skills, presets, sessions, MMR logs, goals, user profile metadata, and favorite plays tagged from Bakkes.
- **`ui/`** is a Svelte + TypeScript single-page app that consumes the API, rendering skills, presets, history, and dashboard surfaces. It also drives the favorites dropdown you saw while working on the skills screen.
- **`bakkes_plugin/`** (this folder) is where the C++ plugin should land. Use this README to understand the contract between the plugin and the API/UI.

## Running the Stack

1. **API:** `cd api && npm install && npm start` → listens on `http://localhost:4000` (or change `PORT`).
2. **UI:** `cd ui && npm install && npm run dev -- --host` → hits `http://localhost:5173` by default and proxies `/api` to the backend.
3. **Plugin:** configure BakkesMod to POST to `http://localhost:4000/api/mmr-log` after each match. The plugin only needs to talk to the API; the UI will react automatically.

## API Endpoints You Care About

| Endpoint | Method | Purpose | Inputs | Notes |
|---|---|---|---|---|
| `/api/mmr-log` | `POST` | Record each ranked match | JSON body with `timestamp`, `playlist`, `mmr`, `gamesPlayedDiff`, `source` (optional) | Responds `201` on success or `400` with a concise error string when validation fails. Plugin should retry idempotently if a 5xx occurs. |
| `/api/mmr` | `GET` | Query stored logs | Optional query: `playlist`, `from`, `to` (ISO strings) | Returns recent logs; used by the UI charts. Useful if the plugin wants to verify ingestion. |
| `/api/v1/bakkes/favorites` | `GET` | List favorites for the current Bakkes user | Requires `X-User-Id` header (case insensitive) | Returns `[ { name, code } ]`. The UI fetches this list on the skills screen to populate a dropdown. The plugin can also POST favorites via whatever UI flow you build. |
| `/api/skills` | `GET`/`POST`/`DELETE` | Manage tracked skills | POST body: `name` + optional `category`, `tags`, `notes`, `favoriteCode` | The UI uses these endpoints; the plugin doesn’t need to talk to them unless it wants to sync favorites to skills. |
| `/api/presets` | `GET`/`POST`/`DELETE` | Persist timer presets | POST body: `name`, `blocks` (array of `{ orderIndex, skillId, type, durationSeconds }`) | Not essential for the plugin but helpful to know the UI flows that rely on them. |
| `/api/sessions` | `GET`/`POST` | Capture live training sessions | POST body: `startedTime`, `finishedTime`, `source`, `blocks`, etc. | UI uses this when you run a preset; plugin rarely touches it.
| `/api/profile` ... | multiple | Store profile+goal metadata | | Plugin doesn’t call these, but the UI reflects how the profile and goals relate to MMR data.

### `/api/mmr-log` Payload Example

```json
{
  "timestamp": "2025-11-16T17:02:30Z",
  "playlist": "Standard",
  "mmr": 2104,
  "gamesPlayedDiff": 1,
  "source": "bakkes"
}
```

- `timestamp` (string) – ISO 8601 UTC string of match completion.
- `playlist` (string) – name like `Standard`, `Doubles`, `Hoops`, etc.
- `mmr` (number) – end-of-match MMR reading; typically from Bakkes `MMR_MIN`/`MAX` fields.
- `gamesPlayedDiff` (number) – usually `1`; the API uses it for session count tracking.
- `source` (string, optional) – you can send `bakkes`, `manual`, etc.

The API validates field presence/format and returns `400` errors like `"shader must be ..."`. Include meaningful logging so you can see failure reasons in the plugin’s console output.

## Favorites Sync Details

- When the UI hits `/api/v1/bakkes/favorites`, it sends `X-User-Id` with whatever `VITE_BAKKES_USER_ID` is configured locally for testing (ex: `test-player`). Make sure your plugin also sends a stable user ID on every request so the server can resolve that user’s favorites.
- Favorites are stored per-user in `bakkes_favorites` and look like `{ userId, name, code }`. The UI uses a favorites dropdown on the skills form and persists the `favoriteCode` with the skill. If your plugin also knows favorite names/codes, push them into this table via a small companion endpoint you add, or coordinate with the UI flows.

## UI Behavior That Matters

- The skills screen (`ui/src/lib/SkillsScreen.svelte`) fetches favorites and displays:
  - a loading state while the API responds;
  - an error state with the feedback text from `/api/v1/bakkes/favorites` if it fails;
  - a disabled dropdown when there are no favorites;
  - a dropdown bound to `selectedFavoriteCode` when favorites exist.
- Submit handlers include `favoriteCode` in the `createSkill` payload, so a matching favorite can be associated with the new skill.
- Since the UI runs locally, no authentication is required. The plugin simply needs to target the same localhost host/port combination.

## Tips for Plugin Development

1. **Configure a user ID** – Set `VITE_BAKKES_USER_ID` (or an equivalent env var inside the plugin) to identify the player whose favorites should be returned. Use the same ID in your `/api/mmr-log` payload for debugging correlations.
2. **Handle errors gracefully** – When the API replies with `400`, log the error message and optionally retry after you fix the payload. For `5xx`, back off and retry automatically.
3. **Respect timing** – The UI expects near-realtime updates. Send the POST as soon as Bakkes reports the match, and if you batch multiple playlists, send them sequentially.
4. **Expose diagnostics** – You can optionally GET `/api/mmr` right before sending to confirm the most recent log entries, or show a “last sync” indicator in your plugin UI.

## Troubleshooting

- The API logs (stdout inside `api/`) show validation failures or database errors. Watch them while testing.
- The UI runs in Vite; network errors show up in the browser console and the offline banner component inside `HomeScreen.svelte`.
- If the favorites dropdown is stuck on “No favorites yet,” confirm your plugin inserted favorites for the `X-User-Id` you are testing with.

## Next Steps
1. Build the plugin inside this folder, referencing the API contract above. You can copy `api/README.md` features (skills/presets) if your plugin needs to manipulate training data.
2. When ready, integrate plugin UI telemetry with the training dashboard by posting to `/api/mmr-log` and optionally calling `/api/v1/bakkes/favorites` so the UI stays in sync.