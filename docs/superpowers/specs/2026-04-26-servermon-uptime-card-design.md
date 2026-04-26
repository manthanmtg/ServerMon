# ServerMon Uptime Card Design

## Goal

Show ServerMon app process uptime in Settings as a live, attractive status card directly above the existing ServerMon Services card. The value must reset naturally when the ServerMon app process restarts.

## User Experience

The card displays a prominent live ticker such as `1d 3h 3m 5s`. It should feel like a polished status tile, visually aligned with the existing settings cards and recent ServerMon Services card work.

The card includes:

- Title: `ServerMon Uptime`
- Small uppercase label: `UPTIME`
- Main live value: days, hours, minutes, and seconds
- Helper copy: `Resets when ServerMon restarts`
- A small status badge based on `/api/health`: `Online`, `Degraded`, or `Unavailable`

The card appears in the right settings column immediately above `ServerMonServicesCard`.

## Data Source

Use the existing `GET /api/health` endpoint. It already returns `uptime` in seconds from a module-level process start timestamp. This matches the desired behavior because a ServerMon restart reloads the process and resets the value.

No persistence is needed. No new database model is needed.

## Client Behavior

Create a dedicated client component, `ServerMonUptimeCard`, under `src/components/settings/`.

On mount, the component fetches `/api/health` and stores:

- Returned uptime seconds
- Health status
- Local timestamp when the response was received

The rendered ticker computes:

```text
displayed uptime = fetched uptime + seconds elapsed locally since fetch
```

The component updates once per second. It may refresh from `/api/health` periodically or when the tab regains focus, but it should not need constant network polling to tick smoothly.

## Formatting

Format uptime as a compact stable string:

- `5s`
- `3m 5s`
- `2h 3m 5s`
- `1d 3h 3m 5s`

The output should always include seconds for the live ticker.

## Error Handling

While loading, show a tasteful placeholder rather than a blank card.

If `/api/health` fails or returns malformed data:

- Show `Unavailable`
- Show muted helper copy indicating uptime could not be loaded
- Keep the card layout stable

If `/api/health` returns a non-OK health status with valid uptime, continue showing the uptime and mark the badge as `Degraded`.

## Testing

Add focused tests for:

- Rendering the fetched uptime
- Ticker advancing locally without another fetch
- Formatting days, hours, minutes, and seconds
- Unavailable state on failed fetch

Update the settings page test only if necessary to account for the new card.
