# API Notes

## Profile

- `GET /api/profile` returns the single profile settings row along with the list of training goals and their latest progress totals (minutes, sessions, and timestamps) scoped to each goal's `periodDays` window.
- `PUT /api/profile/settings` upserts the settings row. The payload must include `name`, `timezone`, and `defaultWeeklyTargetMinutes` (non-negative number). `avatarUrl` is optional but must be a string when present.

## Training goals

- `POST /api/profile/goals` creates or updates a goal. Include `label`, `goalType` (`global` or `skill`), `periodDays` (positive integer), and optional `targetMinutes`/`targetSessions`. Skill goals must also include `skillId`.
- `DELETE /api/profile/goals/:id` removes a saved goal by id.
- `GET /api/profile/goals/progress?goalId=...` returns the computed metrics for a single goal using the provided `goalId` (optionally scoped with `from` and `to` query parameters). The response includes `actualSeconds`, `actualMinutes`, and `actualSessions` so callers can compare against their targets.
