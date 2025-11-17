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

- The API logs (stdout inside `api/`) show validation failures or database errors. Watch them while testing.

ImGui (required)
-----------------

Dear ImGui is required for building this plugin. There is no local fallback included — the build will fail if `imgui.h` isn't available. To simplify developer setup, a helper script is provided to fetch ImGui into the untracked `third_party/imgui` folder.

Notes:
- `third_party/imgui` is intentionally not committed to the repository. The helper script clones ImGui locally during developer setup.
- The CMake option `RTJ_REQUIRE_IMGUI` is ON by default; leave it on to ensure runtime parity with the real ImGui API.

Automatic fetch (Windows PowerShell):

```powershell
# From repository root
pwsh .\bakkes_plugin\scripts\fetch_imgui.ps1
```

Manual fetch (git):

```powershell
| `rtj_api_base_url` | `http://localhost:4000` | Points to the Express API that powers the UI. |
| `rtj_user_id` | `test-player` | Sent as `X-User-Id` so `/api/v1/bakkes/favorites` can associate favorites with the correct player. |
| `rtj_games_played_increment` | `1` | Controls the `gamesPlayedDiff` field in the payload. |

The `rtj_force_upload` notifier pushes whatever match data is currently cached (for example, right after a game ends) without waiting for the next event trigger.

Manual fetch (macOS / Linux):

```bash

### Building

1. Install the [BakkesMod Plugin SDK](https://bakkesmodwiki.com/wiki/BakkesModSDK) and set the `BAKKESMODSDK` environment variable to the SDK root.
2. From this folder run:

After fetching ImGui, reconfigure and build (example):

```powershell

   ```bash
   cmake -S . -B build
   cmake --build build --config Release
   ```

3. Copy `build/Release/RLTrainingJournalPlugin.dll` (plus `pluginconfig.json`) into `BakkesMod/plugins` and enable it inside the in-game plugin manager.

The plugin uses standard WinHTTP for networking, so no additional dependencies are required beyond the SDK and the Windows toolchain.