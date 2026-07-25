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

- `main/` — lifecycle, tray menu, scheduler, windows, IPC, Swift EventKit. See `src/main/AGENTS.md`.
- `renderer/` — vanilla TS UI for list, settings, alert. See `src/renderer/AGENTS.md`.
- `preload/` — `window.api` bridge. See `src/preload/AGENTS.md`.
- `shared/` — contracts, brands, settings v2, allowlist, pure utils. See `src/shared/AGENTS.md`.
- `assets/` — tray icon PNGs; load through `nativeImage.createFromPath()`.

## Where to change things

| Task                       | Files                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Add IPC channel            | `shared/ipc-channels.ts` → `main/ipc-handlers/*` → `preload/index.ts` → renderer caller |
| Join meeting behavior      | `main/utils/join-meeting.ts`, menu, shortcuts, alert/renderer callers                   |
| Calendar query/parsing     | `main/domain/calendar.ts`, `main/swift/*`, `googlemeet-events.swift`                    |
| Scheduler behavior         | `main/scheduler/facade.ts` + internal scheduler only                                    |
| Settings schema            | `shared/settings.ts`, `main/domain/settings.ts`, settings renderer/tests                |
| URL allowlist              | `shared/meet-url-allowlist.ts` + Swift extraction + tests                               |
| Meeting platform detection | `main/utils/platform.ts` → `meet-url.ts`                                                |
| Browser windows            | `main/windows/*`, `main/utils/browser-window.ts`                                        |

## src-local rules

- Use `.js` extensions in TypeScript imports; `import type` for types.
- IPC: `typedHandle` / `typedSend` only.
- Scheduler consumers: `facade.js` only.
- Joins: `joinMeetingById` for user-initiated open; never skip mark-opened.
