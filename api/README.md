# API Notes

## Profile

- `GET /api/profile` returns the single profile settings row along with the list of training goals and their latest progress totals (minutes, sessions, and timestamps) scoped to each goal's `periodDays` window.
- `PUT /api/profile/settings` upserts the settings row. The payload must include `name`, `timezone`, and `defaultWeeklyTargetMinutes` (non-negative number). `avatarUrl` is optional but must be a string when present.

## Training goals

- `POST /api/profile/goals` creates or updates a goal. Include `label`, `goalType` (`global` or `skill`), `periodDays` (positive integer), and optional `targetMinutes`/`targetSessions`. Skill goals must also include `skillId`.
- `DELETE /api/profile/goals/:id` removes a saved goal by id.
- `GET /api/profile/goals/progress?goalId=...` returns the computed metrics for a single goal using the provided `goalId` (optionally scoped with `from` and `to` query parameters). The response includes `actualSeconds`, `actualMinutes`, and `actualSessions` so callers can compare against their targets.

## BakkesMod history

- `GET /api/bakkesmod/history` returns the most recent MMR logs, training sessions, and a `status` object that includes timestamps plus the limits and filters used. This is intended for the BakkesMod plugin to show a synopsis without dialing multiple routes.
- Allowed query parameters:
	- `mmrLimit` (integer, defaults to 50, max 200)
	- `sessionLimit` (integer, defaults to 25, max 200)
	- `playlist` (filters MMR logs by the provided playlist)
	- `mmrFrom` / `mmrTo` (timestamp range applied to MMR log timestamps)
	- `sessionStart` / `sessionEnd` (timestamp range applied to session `startedTime`)
- Invalid limit values return a `400` with an error explaining which parameter is malformed.
- Example response:

```json
{
	"mmrHistory": [
		{
			"id": 1,
			"timestamp": "2025-11-18T18:00:00Z",
			"playlist": "Standard",
			"mmr": 2150,
			"gamesPlayedDiff": 1,
			"source": "bakkes"
		}
	],
	"trainingHistory": [
		{
			"id": 2,
			"startedTime": "2025-11-18T19:30:00Z",
			"finishedTime": null,
			"source": "bakkesmod",
			"presetId": null,
			"notes": null,
			"actualDuration": 60,
			"skillIds": [],
			"blocks": []
		}
	],
	"status": {
		"receivedAt": "2025-11-18T19:45:00.000Z",
		"generatedAt": "2025-11-18T19:45:00.000Z",
		"mmrEntries": 1,
		"trainingSessions": 1,
		"lastMmrTimestamp": "2025-11-18T18:00:00Z",
		"lastTrainingTimestamp": "2025-11-18T19:30:00Z",
		"mmrLimit": 1,
		"sessionLimit": 1,
		"filters": {
			"playlist": "Standard",
			"mmrFrom": null,
			"mmrTo": null,
			"sessionStart": null,
			"sessionEnd": null
		}
	}
}
```
