# Shared — Cross-Process Contracts

Pure TypeScript contracts and utilities shared by main, preload, and renderer. Must not import Electron, Node process APIs, or DOM globals.

## Files

| File | Role |
| --- | --- |
| `ipc-channels.ts` | `IPC_CHANNELS`, `IpcChannelMap`, `PushChannelMap`, `IpcRequest`, `IpcResponse`. |
| `meeting-event.ts` | `MeetingEvent` with branded IDs, dates, and optional meeting URL. |
| `calendar-result.ts` | `CalendarResult` (`kind: "ok" | "err"`), `isCalendarOk()`, permission type. |
| `calendar-ui-state.ts` | `CalendarUiState` / phase for tray + Settings Google account UI. |
| `type-guards.ts` | `isObjectRecord` (generic; not under `main/swift`). |
| `brand.ts` | `EventId`, `MeetUrl`, `IsoUtc`, `WindowHeight` and validators. |
| `errors.ts` | `AppError` taxonomy (`calendar-*`, validation, io, unknown), helpers, guards. |
| `event-signature.ts` | Stable event/list signatures for scheduler push and renderer rerender gating. |
| `result.ts` | Generic `Result<T,E>` and `AppResult<T>`. |
| `settings.ts` | `AppSettings`, defaults, min/max constants. |
| `alert.ts` | Narrow `AlertPayload` for full-screen alert display. |
| `app-state.ts` | Renderer app-state type extracted for tests and contracts. |
| `parse-json.ts` | JSON object parser + validator bridge returning `AppResult<T>`. |
| `utils/escape-html.ts` | XSS escaping for HTML string renderers. |
| `utils/time.ts` | Shared date/time formatting helpers. |
| `ipc-channels.ts` | Channel names, `IpcChannelMap` (includes `APP_JOIN_MEETING` → `Result`), `PushChannelMap`. |
| `settings.ts` | **Schema v2** `AppSettings`, defaults, clamps, `isInQuietHours`. |

## Settings schema (v2)

- `IPC_CHANNELS` is the single source of channel names; keep it `as const`.
- Invoke channels map to `{ request, response }` in `IpcChannelMap` (includes `CALENDAR_DISCONNECT`, `CALENDAR_UI_STATE`).
- Push channels (`SETTINGS_CHANGED`, `CALENDAR_EVENTS_UPDATED`, `ALERT_SHOW`) map payloads in `PushChannelMap` and are main → renderer only.
- Fire-and-forget channels (`ALERT_DISMISSED`, `SCHEDULER_FORCE_POLL`, `WINDOW_SET_HEIGHT`) still have typed request payloads.
- Main-process bus event `calendar-status-updated` is **not** an IPC push; tray listens in main via `events.ts`.
- Add a channel by updating shared channel maps first, then main handler, preload API, renderer caller, and tests.
`AppSettings`: `schemaVersion` (2), `openBeforeMinutes` (**0–10**), `launchAtLogin`, `showTomorrowMeetings`, `windowAlert`, `autoOpenEnabled`, `alertLeadSeconds`, `nativeNotifications`, `lateJoinGraceMinutes`, `quietHoursEnabled`, `quietHoursStart`/`End` (`HH:mm`, midnight wrap via `isInQuietHours`).

Defaults preserve historical behavior (auto-open on, alert lead 60s, late-join 0, quiet hours off).

## IPC notes

- `APP_OPEN_EXTERNAL` / `APP_JOIN_MEETING` responses are `Result<void, string>`.
- Push: `SETTINGS_CHANGED`, `CALENDAR_EVENTS_UPDATED`, `ALERT_SHOW`.
- Fire-and-forget still type their payloads (`ALERT_DISMISSED`, etc.).

## Brands / allowlist

`AppSettings`: `schemaVersion`, `openBeforeMinutes` (1–5), `launchAtLogin`, `showTomorrowMeetings`, `windowAlert`. Defaults live in `DEFAULT_SETTINGS`.

## Brands

Branded types are runtime strings/numbers with compile-time protection:

- `EventId` — non-empty trimmed string.
- `MeetUrl` — structurally valid HTTPS URL, no credentials, default port. Host allowlists live in main/preload egress checks.
- `IsoUtc` — finite date, with bare timestamps normalized as UTC.
- `WindowHeight` — rounded/clamped number in `[220, 480]`.

Validators return `Result<T,string>` and are used at Swift parser ingress, preload boundary, URL validation, and tests. Do not assign raw primitives to branded fields.

## Error/result rules

- Generic `Result<T,E>` uses `ok: true | false`.
- `AppResult<T>` is `Result<T, AppError>`.
- `AppError.kind` variants: `calendar-permission-denied`, `calendar-no-calendars`, `calendar-runtime`, `calendar-auth`, `calendar-network`, `validation`, `io`, `unknown`.
- Prefer `isCalendarPermissionDenied` / `isCalendarRuntime` (etc.) over ad-hoc kind checks.
- `errFrom()` wraps unknown thrown values; `formatAppError()` creates user-facing text.
- `isObjectRecord` lives in `type-guards.ts` (not under `main/swift/`).
- `parseJsonObject(raw, field, validate)` parses JSON, requires a plain object, then delegates validation. Parse/shape failures return `validation` errors.

## Rules

- No barrels; no Electron/Node/DOM.
- No `satisfies` / `enum` / `namespace`.
- Side-effect-free modules only.
