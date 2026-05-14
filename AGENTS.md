# GogMeet — AGENTS.md

macOS tray app for Google Meet calendar reminders. Reads macOS Calendar via Swift EventKit, auto-opens Meet/Zoom/wrapper URLs 1–5 min before start, full-screen alert overlay, global shortcut (`Cmd+Shift+M`).

## STACK

| Layer    | Tech                                                              |
| -------- | ----------------------------------------------------------------- |
| Runtime  | Electron `^42.0.1` (sandboxed BrowserWindows, contextIsolation)   |
| Language | TypeScript `^6.0.3` (`isolatedDeclarations`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noPropertyAccessFromIndexSignature`) |
| Build    | Rslib (main + preload, CJS) + Rsbuild (renderer, ESM, 3 envs)     |
| Package  | Bun `>=1.3.12` (`packageManager: bun@1.3.14`); Node `>=20`        |
| Calendar | Swift EventKit helper (`googlemeet-events.swift`, hash-cached)    |
| Test     | Vitest `^4.1.6` workspace (main / renderer / shared)              |
| Logging  | `electron-log` `^5.4.4`                                           |
| Updates  | `electron-updater` `^6.8.3`                                       |

Three-process layout: `src/main/` (Electron main), `src/preload/` (context bridge), `src/renderer/` (UI, vanilla TS, 3 entries — popover, settings, alert), `src/shared/` (types-only, `.js` extension imports).

## COMMANDS

```bash
bun install
bun run dev              # Watch + electron (scripts/dev.ts)
bun run build            # build:main && build:preload && build:renderer
bun run build:main       # rslib build -c rslib.config.ts
bun run build:preload    # rslib build -c rslib.config.preload.ts
bun run build:renderer   # rsbuild build
bun run package          # build && electron-builder --mac (DMG + ZIP)
bun run package:dir      # build && electron-builder --mac --dir (unpacked)
bun run typecheck        # tsc -b
bun run test             # vitest run -c vitest.workspace.ts
bun run test:watch       # vitest -c vitest.workspace.ts
bun run test:coverage    # vitest run -c vitest.workspace.ts --coverage
bun run lint             # eslint src/ --cache
bun run format:check     # prettier --check 'src/**/*.{ts,css}'
bun run format           # prettier --write 'src/**/*.{ts,css}'
bun run clean            # rimraf lib dist
```

CI (`pr-check`) runs `typecheck` → `test` → `test:coverage`. The release workflow runs `build` → `package`, then tags and uploads artifacts.

## CONVENTIONS (project-wide)

- **Imports use the `.js` extension** even when the source is `.ts` (CJS/ESM interop, `verbatimModuleSyntax`).
- `import type { … }` is mandatory for type-only imports.
- **No barrel files**. Import from concrete paths. `scheduler/index.ts` deliberately does not re-export `poll.ts`; go through `scheduler/facade.ts`.
- **IPC: `typedHandle()` only** in main; `IpcResponse<T>` in preload; `typedSend()` for main→renderer push (never raw `webContents.send()`).
- **Branded types** (`EventId`, `MeetUrl`, `IsoUtc`, `WindowHeight`) validated at trust boundaries. Never assign raw strings.
- `as const` on lookup maps and config. No `satisfies` (incompatible with `isolatedDeclarations`). No `enum` / `namespace` (`erasableSyntaxOnly`).
- Bracket notation for index-signature objects (`obj["key"]`).
- Errors are typed: `AppError` discriminated union (`src/shared/errors.ts`); discriminate via `result.kind === "ok"` or `isCalendarOk()`. Never duck-type.
- All BrowserWindows: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.

## ANTI-PATTERNS

- `as any`, `@ts-ignore`, `@ts-expect-error`. Banned.
- Raw `webContents.send()` / `ipcMain.handle()`. Use `typedSend` / `typedHandle`.
- `shell.openExternal()` directly. Use `openMeetingUrl()` (allowlist-validated).
- `.startsWith()` for URL validation. Use `new URL(u).hostname` exact match against `MEETING_URL_ALLOWLIST`.
- `innerHTML` without `escapeHtml()` (XSS).
- `fs.readFileSync()` for tray icons. Use `nativeImage.createFromPath()`.
- Bundling Electron in the preload build. Preload must keep `electron` external.
- Bundling Swift source into ASAR. `swiftc` cannot read from ASAR. Swift sources go in `asarUnpack`.
- `allowSleep()` without a matching `preventSleep()`. Power refs are reference-counted.
- Bypassing `validateSender()` in IPC handlers.
- Reaching into `scheduler/poll.ts` directly. The facade is the only public entry.

## PACKAGING & RELEASE

- Config: `electron-builder.yml` (root). Targets DMG + ZIP for `arm64` and `x64`, macOS 11.0+.
- `asarUnpack` includes the Swift helper sources.
- `afterPack`: `build/after-pack.cjs`.
- `afterSign`: `build/notarize.cjs`. Apple notarization. Reads env vars `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`; skips with a warning if any are missing or platform isn’t `darwin`.
- Entitlements: `build/entitlements.mac.plist`, `build/entitlements.mac.inherit.plist`.
- App icon: `build/icon.icns`.
- Local DMG helper: `./build-macOS-dmg.sh [--environment <name>]`.
- Releases (DMG + ZIP) are published on GitHub Releases; `electron-updater` consumes the same feed.

## TESTS

Vitest workspace (`vitest.workspace.ts`) splits `tests/main/` (Node + Electron auto-mock), `tests/renderer/` (jsdom), and `tests/shared/`. Helpers in `tests/helpers/test-utils.ts`. Use `bun run test:coverage` for v8 coverage; CI gates on it.

## DIRECTORY MAP

- `src/` — application source (see `src/AGENTS.md`).
- `tests/` — Vitest workspace (see `tests/AGENTS.md`).
- `scripts/dev.ts` — dev orchestrator (rslib watch + rsbuild dev + electron).
- `scripts/generate-calendar-tray-icons.mjs` — regenerate tray icon PNGs.
- `build/` — packaging assets and afterPack/afterSign hooks.
- `assets/` — README screenshots.
- `lib/`, `dist/` — generated outputs (cleaned by `bun run clean`).
- `.sentrux/rules.toml` — architecture constraints (modularity, acyclicity, depth).

## NOTES

- Calendar permission: first access triggers the macOS EventKit permission dialog.
- Swift binary cache: compiled to `/tmp/googlemeet/` on first run, hash-keyed; mode `0o700`; 5 retries with exponential backoff (1s → 30s).
- Swift exit codes: `0` success, `2` permission denied, `3` no calendars, `4` error.
- Swift output: 9 tab-delimited fields. `uid\ttitle\tstartISO\tendISO\turl\tcalName\tallDay\temail\tnotes`.
- Auto-open: 1–5 min before non-all-day meetings; `?authuser=email` is appended for Google Meet only.
- Full-screen alert: fires 60s after the browser-open offset (`openBeforeMinutes - 1` min before start, clamped at now) and dismissing it cancels browser auto-open.
- Scheduler polling: 2 min on AC, 4 min on battery; `forcePoll()` coalesces (skips if a poll completed within the last 10 s); `consecutiveErrors` capped at 4.
- Popover hides on blur (dev mode exempt).
- Calendly / SavvyCal / wrapper URLs are opened directly; the browser handles the 302 redirect to the underlying Meet/Zoom room.
