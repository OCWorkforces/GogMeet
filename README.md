# GogMeet

GogMeet is a macOS menu bar app that watches your macOS Calendar for online meetings and helps you join on time. It reads Calendar events through a Swift EventKit helper, shows upcoming meetings from the tray, auto-opens meeting links before start time, and can show a dedicated alert window for imminent meetings.

## Features

- **Menu bar first** — runs as a tray-only macOS app with no Dock icon during normal use.
- **macOS Calendar integration** — fetches today's and tomorrow's events from EventKit and ignores cancelled or declined meetings.
- **Meeting link detection** — extracts Google Meet, Zoom, and Calendly links from event URL, location, or notes fields.
- **Safe URL opening** — only opens allowlisted HTTPS meeting hosts; Google Meet receives `authuser=<email>` and Zoom receives `uname=<email>` when the Calendar account email is available.
- **Configurable auto-open** — opens browser links 1–5 minutes before non-all-day meetings.
- **Alert window** — optionally shows a secure alert window shortly before a meeting; dismissing the alert cancels that meeting's pending browser auto-open.
- **Tray meeting list** — click the tray icon to view cached upcoming meetings, manually refresh, open settings, or view app info.
- **Tray countdowns** — displays pre-meeting and in-meeting countdown text beside the tray icon.
- **Tomorrow toggle** — show or hide tomorrow's meetings in the tray popover.
- **Launch at login** — optional macOS login item support.
- **Global shortcut** — press `Cmd+Shift+M` to join the next upcoming meeting with a URL.
- **Auto-updates** — packaged builds check GitHub Releases through `electron-updater` and install downloaded updates on quit.

## Screenshots

![Settings](assets/setting-page.png)

_Configure auto-open timing, launch at login, tomorrow's meetings, and alert behavior._

## Download

Download the latest packaged build from the [GitHub Releases page](https://github.com/OCWorkforces/GogMeet/releases).

## Requirements

### Running the app

- macOS 11.0 or newer.
- Calendar access permission for GogMeet.
- A Calendar account that contains Google Meet, Zoom, or Calendly URLs.

### Developing or packaging

- macOS with Xcode Command Line Tools available (`swiftc`, `codesign`).
- Node.js `>=20.0.0`.
- Bun `>=1.3.12` (`packageManager: bun@1.3.14`).

## Development

Install dependencies:

```bash
bun install
```

Common commands:

```bash
bun run dev              # Watch main/preload + run renderer dev server + Electron
bun run build            # Build main, preload, and renderer outputs
bun run build:main       # Build Electron main process with Rslib
bun run build:preload    # Build sandboxed preload bundle with Rslib
bun run build:renderer   # Build renderer pages with Rsbuild
bun run typecheck        # TypeScript project references check
bun run test             # Vitest workspace test run
bun run test:watch       # Vitest watch/UI workflow
bun run test:coverage    # Vitest coverage with v8
bun run lint             # ESLint over src/
bun run format:check     # Prettier check for src/**/*.{ts,css}
bun run format           # Prettier write for src/**/*.{ts,css}
bun run clean            # Remove lib/ and dist/
```

## Architecture

GogMeet is an Electron app split into strict process boundaries:

| Area     | Source                 | Output                  | Purpose                                                                                     |
| -------- | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Main     | `src/main/index.ts`    | `lib/main/index.cjs`    | App lifecycle, tray, scheduler, secure windows, IPC handlers, Calendar/EventKit integration |
| Preload  | `src/preload/index.ts` | `lib/preload/index.cjs` | Sandboxed `window.api` context bridge                                                       |
| Renderer | `src/renderer/`        | `lib/renderer/`         | Vanilla TypeScript UI for popover, settings, and alert pages                                |
| Shared   | `src/shared/`          | Bundled into consumers  | Branded types, settings, IPC contracts, errors, and pure utilities                          |

Key runtime pieces:

- `src/main/domain/calendar.ts` calls the Swift integration and returns typed `CalendarResult` values.
- `src/main/googlemeet-events.swift` queries EventKit for a two-day range starting today and prints 9 tab-delimited fields per event.
- `src/main/swift/` compiles and caches the Swift helper in `/tmp/googlemeet/`, keyed by the Swift source hash.
- `src/main/scheduler/facade.ts` is the public scheduler API. Polling runs every 2 minutes on AC power and every 4 minutes on battery; force polls coalesce within 10 seconds.
- `src/main/scheduler/` schedules browser-open timers, alert timers, and tray countdowns.
- `src/main/utils/url-validation.ts` owns the meeting URL allowlist.
- `src/main/utils/browser-window.ts` centralizes secure BrowserWindow defaults (`sandbox`, `contextIsolation`, no Node integration).

## Settings

Defaults live in `src/shared/settings.ts`:

| Setting                | Default | Notes                                                      |
| ---------------------- | ------- | ---------------------------------------------------------- |
| `openBeforeMinutes`    | `1`     | Browser auto-open offset, clamped to 1–5 minutes           |
| `launchAtLogin`        | `false` | Syncs to macOS login items                                 |
| `showTomorrowMeetings` | `true`  | Controls whether tomorrow's events appear in the tray list |
| `windowAlert`          | `true`  | Enables the pre-meeting alert window                       |

## Calendar and permissions

On first use, GogMeet requests Calendar access. If permission is denied, meeting fetching will return a typed Calendar error and the UI will show the permission state.

The Swift helper protocol is intentionally simple:

```text
uid<TAB>title<TAB>startISO<TAB>endISO<TAB>url<TAB>calName<TAB>allDay<TAB>email<TAB>notes
```

Swift helper exit codes:

| Code | Meaning                    |
| ---- | -------------------------- |
| `0`  | Success                    |
| `2`  | Calendar permission denied |
| `3`  | No calendars available     |
| `4`  | Runtime/helper error       |

## Packaging

Build packaged macOS artifacts with Electron Builder:

```bash
bun run package      # Build + package DMG and ZIP targets
bun run package:dir  # Build + create unpacked macOS app directory
```

`electron-builder.yml` packages DMG and ZIP targets for both `arm64` and `x64`, writes artifacts to `dist/`, and keeps `src/main/googlemeet-events.swift` unpacked from ASAR so `swiftc` can read it.

There is also a local Apple Silicon DMG helper:

```bash
./build-macOS-dmg.sh                    # Build an arm64 DMG
./build-macOS-dmg.sh --environment beta  # Append an environment suffix to the DMG filename
./build-macOS-dmg.sh --help
```

The helper script installs dependencies, cleans `dist/`, builds the app, packages an arm64 DMG, signs with a Developer ID certificate when available, and falls back to ad-hoc signing otherwise.

## Release and CI

- PR checks run on macOS for pushes and pull requests to `develop` and `main`:
  - `bun run typecheck`
  - `bun run test`
  - `bun run test:coverage`
- Releases run on pushes to `main` and `v*` tags. The workflow builds, creates a version tag from `package.json` when needed, packages the app, and uploads `dist/*.dmg` and `dist/*.zip` to GitHub Releases.
- Notarization reads `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_PASSWORD` when present.

## Troubleshooting

### macOS blocks the app

Ad-hoc signed local builds can be blocked by Gatekeeper. After copying the app to `/Applications`, either use **System Settings → Privacy & Security → Open Anyway** or remove quarantine:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/GogMeet.app"
```

### Calendar events do not appear

1. Confirm Calendar permission in **System Settings → Privacy & Security → Calendars**.
2. Make sure the event contains a supported meeting URL in the event URL, location, or notes field.
3. Click the tray icon and use refresh/retry to force a poll.
4. Check logs:

   ```bash
   log stream --predicate 'process == "GogMeet"' --level debug
   ```

### Local packaged build crashes on launch

1. Confirm Xcode Command Line Tools are installed for `swiftc` and `codesign`.
2. If the build was ad-hoc signed, re-sign the copied app bundle:

   ```bash
   codesign --force --deep --sign - "/Applications/GogMeet.app"
   ```

3. Remove and reinstall the app from a fresh DMG if needed.

## Tech Stack

| Layer           | Tech                      |
| --------------- | ------------------------- |
| Runtime         | Electron `^42.1.0`        |
| Language        | TypeScript `^6.0.3`       |
| Build           | Rslib + Rsbuild           |
| Package manager | Bun `1.3.14`              |
| Calendar        | Swift EventKit helper     |
| Tests           | Vitest `^4.1.6` workspace |
| Logging         | `electron-log`            |
| Updates         | `electron-updater`        |

## Contact

For questions or issues, contact [kennydizi@ocworkforces.com](mailto:kennydizi@ocworkforces.com).

## License

MIT
