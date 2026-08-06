# Shared — Cross-Process Contracts

IPC maps and thin cross-process DTOs used by main, preload, and renderer. **Entities and pure domain policy live in `src/domain/`**. Shared must not import Electron, Node process APIs, or DOM globals.

## Files

| File | Role |
| --- | --- |
| `ipc-channels.ts` | `IPC_CHANNELS`, `IpcChannelMap`, `PushChannelMap` — invoke + push maps; imports domain entity types |
| `alert.ts` | Narrow `AlertPayload` for full-screen alert (`id`, title, times, `hasMeetUrl`, optional `autoOpenAt`) — **no `meetUrl`** |
| `app-state.ts` | Popover list UI state: `loading` \| `no-permission` \| `no-events` \| `has-events` \| `error` (distinct from tray/settings `CalendarUiPhase`) |
| `utils/escape-html.ts` | XSS escaping for HTML string renderers |
| `utils/app-icon-aurora.ts` | Pure CSS + HTML strings for brand-icon aurora (`APP_ICON_AURORA_CSS`, `appIconWithAuroraHtml`); palette tracks `about-icon.svg` blue `#4285F4`; **base** tier for Settings (calmer, counter ring paused); **`.app-icon-aurora--about`** fancy tier for About/Update; reduced-motion / reduced-transparency / contrast with matching `--about` specificity; no DOM |
| `utils/as.ts` | `.As<T>()` / free-function `As<T>(value)` for unchecked casts (replaces `as unknown as T`); listed in package `sideEffects` |

Cast helper notes:

- Free function `As(value)` is required for `null` / `undefined` and for **production main/preload** paths (named import survives Rslib tree-shaking).
- Method form `value.As()` needs `Object.prototype.As` installed; Vitest does this via `tests/setup.as.ts`. Bare side-effect-only imports are not reliable under `sideEffects` bundling.
- Not a trust boundary — prefer brands / type guards when validating untrusted data.

## Domain (not here)

| Concern | Canonical path |
| --- | --- |
| Brands, Result, errors, MeetingEvent, CalendarResult, CalendarPublication, settings (v3), CalendarUiState | `src/domain/entities/*` |
| Meet URL allowlist | `src/domain/policies/meet-url-allowlist.ts` |
| buildMeetUrl, validateMeetUrl, pickJoinTarget, meeting-time, time, url-extract | `src/domain/services/*` |

## RULES

- Prefer importing domain types for contracts; **do not re-export** domain symbols from shared.
- `IPC_CHANNELS` is the single source of channel names; keep it `as const`.
- Invoke map (`IpcChannelMap`) and push map (`PushChannelMap`) are separate — e.g. `SETTINGS_CHANGED` is push-only (not in the invoke map).
- Add a channel by updating shared channel maps first, then main handler, preload API, renderer caller, and tests.
- Keep this package tiny — if logic is pure and process-neutral, put it in `src/domain/`.
- UI string helpers (`escape-html`, `app-icon-aurora`) stay free of Electron/DOM so main (data: HTML) and renderer can share them.
