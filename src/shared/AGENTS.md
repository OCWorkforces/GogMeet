# Shared — Cross-Process Contracts

IPC maps and thin cross-process DTOs used by main, preload, and renderer. **Entities and pure domain policy live in `src/domain/`**. Shared must not import Electron, Node process APIs, or DOM globals.

## Files

| File | Role |
| --- | --- |
| `ipc-channels.ts` | `IPC_CHANNELS`, `IpcChannelMap`, `PushChannelMap` — imports domain entity types |
| `alert.ts` | Narrow `AlertPayload` for full-screen alert (`id`, title, times, `hasMeetUrl`, optional `autoOpenAt`) |
| `app-state.ts` | Renderer list UI state union |
| `utils/escape-html.ts` | XSS escaping for HTML string renderers |

## Domain (not here)

| Concern | Canonical path |
| --- | --- |
| Brands, Result, errors, MeetingEvent, CalendarResult, settings, CalendarUiState | `src/domain/entities/*` |
| Meet URL allowlist | `src/domain/policies/meet-url-allowlist.ts` |
| buildMeetUrl, validateMeetUrl, pickJoinTarget, time, url-extract | `src/domain/services/*` |

## RULES

- Prefer importing domain types for contracts; **do not re-export** domain symbols from shared.
- `IPC_CHANNELS` is the single source of channel names; keep it `as const`.
- Add a channel by updating shared channel maps first, then main handler, preload API, renderer caller, and tests.
- Keep this package tiny — if logic is pure and process-neutral, put it in `src/domain/`.
