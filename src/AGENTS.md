# src/ — Source Root

Application source is split by Electron process. Keep process boundaries strict: `main/` owns Node/Electron APIs, `preload/` is the only context bridge, `renderer/` is browser-only UI, and `shared/` is types/utilities consumed by all processes.

## Build outputs

| Source      | Entry                  | Output                  | Runtime                   |
| ----------- | ---------------------- | ----------------------- | ------------------------- |
| `main/`     | `src/main/index.ts`    | `lib/main/index.cjs`    | Electron main (CJS)       |
| `preload/`  | `src/preload/index.ts` | `lib/preload/index.cjs` | sandboxed preload (CJS)   |
| `renderer/` | 3 entries              | `lib/renderer/`         | BrowserWindow pages (ESM) |
| `shared/`   | imported modules       | bundled into consumers  | no runtime side effects   |

## Directory map

- `main/` — lifecycle, tray, scheduler, windows, IPC, **calendar providers** (EventKit + Google). See `src/main/AGENTS.md`.
- `main/calendar/` — `CalendarProvider` factory, Google OAuth/API, Darwin adapter, url-extract, offline cache.
- `main/platform/` — OS predicates (`isDarwin` / `isWin32`); **not** meeting-host detection.
- `main/swift/` — EventKit helper compile/run/JSON Lines parse (**Darwin provider leaf only**).
- `renderer/` — popover, settings (incl. Google account), alert. See `src/renderer/AGENTS.md`.
- `preload/` — `window.api` bridge. See `src/preload/AGENTS.md`.
- `shared/` — contracts, brands, errors, IPC maps, pure utilities. See `src/shared/AGENTS.md`.
- `assets/` — tray icons (mac 18/36 + win 16/32); load via `nativeImage.createFromPath()`.

## Where to change things

| Task | Files |
| --- | --- |
| Add IPC channel | `shared/ipc-channels.ts` → `main/ipc-handlers/*` → `preload/index.ts` → renderer |
| Calendar facade / UI status | `main/domain/calendar.ts`, `shared/calendar-ui-state.ts`, `main/events.ts` |
| Calendar backend (mac/win) | `main/calendar/factory.ts`, `providers/*`, `auth/*` |
| Shared meeting URL extract | `main/calendar/url-extract.ts` (+ Swift `findMeetUrl` for EventKit wire) |
| Swift EventKit wire protocol | `main/swift/*`, `main/googlemeet-events.swift` |
| Scheduler | `main/scheduler/facade.ts` only from outside scheduler |
| Settings schema | `shared/settings.ts`, `main/domain/settings.ts`, settings renderer |
| URL allowlist | `main/utils/url-validation.ts` + preload mirror + tests |
| Meeting host (Meet vs Zoom) | `main/utils/platform.ts` — **not** OS platform |
| OS branching | `main/platform/os.ts` |
| Window chrome | `main/utils/window-chrome.ts`, `main/windows/*` |
| Auto-update | `main/system/auto-updater.ts` (portable skipped) |

## src-local rules

- Use `.js` extensions in TypeScript imports; `import type` for types only.
- Main IPC: `typedHandle()` / `typedSend()` only.
- Scheduler consumers: `scheduler/facade.js` only.
- No static `swift/*` imports outside Darwin provider + `swift/**`.
- Branded values only at trust boundaries.
- Calendar: `isCalendarOk()` / `result.kind === "ok"`.
- Renderer user HTML: `escapeHtml()`.
- Windows OAuth only via tray/Settings — never lifecycle auto-start.
- BrowserWindows: `sandbox`, `contextIsolation`, no Node integration.

## Wrapper provider recipe

Add new meeting hosts after updating **both** extraction paths and allowlists:

1. Swift `findMeetUrl` in `googlemeet-events.swift` (Zoom → Meet → Calendly order).
2. `main/calendar/url-extract.ts` regex priority for cloud providers.
3. `MEETING_URL_ALLOWLIST` + preload hostname mirror.
4. Tests for extract, allowlist, and meet-url passthrough.

Egress allowlisting remains in `buildMeetUrl` / `openMeetingUrl` / `APP_OPEN_EXTERNAL`.

## Tests

Vitest: `tests/main/` (Node + Electron mocks), `tests/renderer/` (jsdom), `tests/shared/`, `tests/scripts/`. Helpers in `tests/helpers/test-utils.ts`.
