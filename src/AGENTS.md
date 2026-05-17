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

- `main/` — app lifecycle, tray, scheduler, windows, IPC handlers, Swift EventKit integration. See `src/main/AGENTS.md`.
- `renderer/` — vanilla TypeScript UI for popover, settings, and alert. See `src/renderer/AGENTS.md`.
- `preload/` — `window.api` bridge and renderer-input branding. See `src/preload/AGENTS.md`.
- `shared/` — contracts, brands, errors, IPC channel maps, and pure utilities. See `src/shared/AGENTS.md`.
- `assets/` — tray icon PNGs; load through `nativeImage.createFromPath()`.

## Where to change things

| Task                       | Files                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Add IPC channel            | `shared/ipc-channels.ts` → `main/ipc-handlers/*` → `preload/index.ts` → renderer caller |
| Calendar query/parsing     | `main/domain/calendar.ts`, `main/swift/*`, `main/googlemeet-events.swift`               |
| Scheduler behavior         | `main/scheduler/facade.ts` and internal scheduler modules only                          |
| Settings schema            | `shared/settings.ts`, `main/domain/settings.ts`, settings renderer/tests                |
| URL allowlist              | `main/utils/url-validation.ts` plus security tests                                      |
| Meeting platform detection | `main/utils/platform.ts` → `main/utils/meet-url.ts` branching/tests                     |
| Browser windows            | `main/windows/*` and `main/utils/browser-window.ts`                                     |
| Renderer HTML              | `renderer/rendering/*`, `renderer/utils/escape-html.ts`                                 |

## src-local rules

- Use `.js` extensions in TypeScript imports, even when importing `.ts` source.
- Use `import type` for type-only imports.
- Main IPC handlers use `typedHandle()` and `typedSend()`; never raw `ipcMain.handle()` or `webContents.send()`.
- Scheduler consumers import only `main/scheduler/facade.js`; never reach into `poll.ts` or `state/` from outside scheduler.
- Branded values (`EventId`, `MeetUrl`, `IsoUtc`, `WindowHeight`) are created at trust boundaries only.
- Calendar results narrow via `isCalendarOk()` or `result.kind === "ok"`; generic `Result` narrows via `result.ok`.
- Renderer HTML uses `escapeHtml()` for user content and `parts.push(...).join("")`; no `html +=` rendering loops.
- BrowserWindows keep `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.

## Wrapper provider recipe

Wrapper meeting providers (Calendly, SavvyCal, Cal.com, HubSpot Meetings, etc.) are opened directly; the user browser follows redirects.

1. Add the Swift regex to `findMeetUrl()` in `main/googlemeet-events.swift`, ordered after Zoom and Meet patterns.
2. Add the exact hostname to `MEETING_URL_ALLOWLIST` in `main/utils/url-validation.ts`.
3. Add URL validation tests for typo-squats, credentials/userinfo, casing, and subdomain behavior.
4. Add Swift parser extraction tests and `meet-url` passthrough tests.
5. Confirm wrappers do not receive Google `?authuser=` decoration.
6. Update `main/utils/AGENTS.md` and this recipe if the process changes.

`parseMeetUrlField` remains structural-only (`asMeetUrl`). Egress allowlist checks happen in `buildMeetUrl`, `APP_OPEN_EXTERNAL`, and `openMeetingUrl`.

## Tests

Vitest workspace: `tests/main/` (Node + Electron mocks), `tests/renderer/` (jsdom), `tests/shared/` (Node). Shared factories live in `tests/helpers/test-utils.ts`.
