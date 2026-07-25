# Shared — Cross-Process Contracts

Pure TypeScript contracts and utilities shared by main, preload, and renderer. Must not import Electron, Node process APIs, or DOM globals.

## Files

| File | Role |
| --- | --- |
| `ipc-channels.ts` | Channel names, `IpcChannelMap` (includes `APP_JOIN_MEETING` → `Result`), `PushChannelMap`. |
| `meeting-event.ts` | `MeetingEvent` with branded fields. |
| `calendar-result.ts` | `CalendarResult`; err requires `code`. `isCalendarOk()`. |
| `brand.ts` | `EventId`, `MeetUrl`, `IsoUtc`, `WindowHeight` validators. |
| `errors.ts` | `AppError` taxonomy and guards. |
| `event-signature.ts` | Stable list signatures for push/rerender gating. |
| `result.ts` | Generic `Result<T,E>` / `AppResult`. |
| `settings.ts` | **Schema v2** `AppSettings`, defaults, clamps, `isInQuietHours`. |
| `alert.ts` | `AlertPayload` (no meetUrl; optional `hasMeetUrl`, `autoOpenAt`). |
| `meet-url-allowlist.ts` | Hostname + suffix allowlist SSOT for main + preload. |
| `app-state.ts` | Renderer app-state union. |
| `parse-json.ts` | JSON object parser → `AppResult`. |
| `utils/escape-html.ts` | XSS escaping. |
| `utils/time.ts` | Date/time helpers. |
| `utils/pick-join-target.ts` | Prefer in-progress joinable meeting, else next upcoming. |

## Settings schema (v2)

`AppSettings`: `schemaVersion` (2), `openBeforeMinutes` (**0–10**), `launchAtLogin`, `showTomorrowMeetings`, `windowAlert`, `autoOpenEnabled`, `alertLeadSeconds`, `nativeNotifications`, `lateJoinGraceMinutes`, `quietHoursEnabled`, `quietHoursStart`/`End` (`HH:mm`, midnight wrap via `isInQuietHours`).

Defaults preserve historical behavior (auto-open on, alert lead 60s, late-join 0, quiet hours off).

## IPC notes

- `APP_OPEN_EXTERNAL` / `APP_JOIN_MEETING` responses are `Result<void, string>`.
- Push: `SETTINGS_CHANGED`, `CALENDAR_EVENTS_UPDATED`, `ALERT_SHOW`.
- Fire-and-forget still type their payloads (`ALERT_DISMISSED`, etc.).

## Brands / allowlist

- `asMeetUrl` is structural only; **host allowlist** is `meet-url-allowlist.ts` + `validateMeetUrl` in main.
- Create brands only at trust boundaries.

## Rules

- No barrels; no Electron/Node/DOM.
- No `satisfies` / `enum` / `namespace`.
- Side-effect-free modules only.
