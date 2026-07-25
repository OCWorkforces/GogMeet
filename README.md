# GogMeet

GogMeet is a macOS menu bar app for calendar meeting reminders. It checks your macOS Calendar through a Swift EventKit helper, lists upcoming meetings from the tray, opens meeting links before they start, and can show a focused alert window when a meeting is close.

## Features

- Runs from the macOS menu bar without a Dock icon during normal use.
- Reads today's and tomorrow's Calendar events from EventKit, skipping cancelled and declined meetings.
- Finds Google Meet, Zoom, and Calendly links in an event's URL, location, or notes.
- Opens only allowlisted HTTPS meeting hosts. Google Meet gets `authuser=<email>` and Zoom gets `uname=<email>` when the Calendar account email is available.
- Opens browser links 1 to 5 minutes before non-all-day meetings.
- Shows an optional secure alert window shortly before a meeting. Dismissing the alert cancels that meeting's pending browser auto-open.
- Shows upcoming meetings from the native menu bar menu (right-click / click the tray icon), with settings and app info.
- Displays pre-meeting and in-meeting countdown text beside the tray icon.
- Lets you show or hide tomorrow's meetings in the tray menu.
- Can register itself as a macOS login item.
- Opens the next upcoming meeting with a URL when you press `Cmd+Shift+M`.
- In packaged builds, checks GitHub Releases for updates through `electron-updater` (when release assets include updater metadata such as `latest-mac.yml`) and installs downloaded updates on quit.

## Screenshots

![Settings](assets/setting-page.png)

_Settings for auto-open timing, launch at login, tomorrow's meetings, and alert behavior._

## Download

Grab the latest packaged build from the [GitHub Releases page](https://github.com/OCWorkforces/GogMeet/releases).

## Requirements

### Running the app

- macOS 11.0 or newer.
- Calendar access permission for GogMeet.
- A Calendar account with Google Meet, Zoom, or Calendly URLs.

### Developing or packaging

- macOS with Xcode Command Line Tools available (`swiftc`, `codesign`).
- Bun `>=1.3.0` (`packageManager: bun@1.3.14`) — primary runtime for dev, build, test, lint, and packaging.
- Node.js host runtime: `>=20.0.0` is the floor declared in `engines.node`, but the recommended and CI-validated host version is **Node 26** (see `.nvmrc`). A handful of contributor paths shell out to plain Node — the tray/app icon generator (`scripts/generate-calendar-tray-icons.mjs`) and the release tag step (`node -p ...`) — and must run under host Node 26.
- Note: Electron embeds its own Node runtime for the packaged app. That embedded Node is independent of the host Node 26 used by contributor tooling; do not conflate the two.

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
bun run validate:node    # Enforce host Node major >= 26 and run the icon generator under host Node
bun run clean            # Remove lib/ and dist/
```

## Architecture

GogMeet keeps Electron's main, preload, renderer, and shared code separate:

| Area     | Source                 | Output                  | Purpose                                                                                     |
| -------- | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Main     | `src/main/index.ts`    | `lib/main/index.cjs`    | App lifecycle, tray, scheduler, secure windows, IPC handlers, Calendar/EventKit integration |
| Preload  | `src/preload/index.ts` | `lib/preload/index.cjs` | Sandboxed `window.api` context bridge                                                       |
| Renderer | `src/renderer/`        | `lib/renderer/`         | Vanilla TypeScript UI for popover, settings, and alert pages                                |
| Shared   | `src/shared/`          | Bundled into consumers  | Branded types, settings, IPC contracts, errors, and pure utilities                          |

Runtime files worth knowing:

- `src/main/domain/calendar.ts` calls the Swift integration and returns typed `CalendarResult` values.
- `src/main/googlemeet-events.swift` queries EventKit for a two-day range starting today and prints one JSON array of 9 strings per event line.
- `src/main/swift/` compiles and caches the Swift helper in `/tmp/googlemeet/`, keyed by the Swift source hash.
- `src/main/scheduler/facade.ts` is the public scheduler API. Polling runs every 2 minutes on AC power and every 4 minutes on battery; force polls coalesce within 10 seconds.
- `src/main/scheduler/` schedules browser-open timers, alert timers, and tray countdowns.
- `src/main/utils/url-validation.ts` owns the meeting URL allowlist.
- `src/main/utils/browser-window.ts` centralizes secure BrowserWindow defaults (`sandbox`, `contextIsolation`, no Node integration).

## Settings

Defaults live in `src/shared/settings.ts`:

| Setting                  | Default | Notes                                                                 |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `openBeforeMinutes`      | `1`     | Browser auto-open offset, clamped to 0–10 minutes (`0` = at start)    |
| `launchAtLogin`          | `false` | Syncs to macOS login items                                            |
| `showTomorrowMeetings`   | `true`  | Controls whether tomorrow's events appear in the tray menu            |
| `windowAlert`            | `true`  | Enables the pre-meeting alert window                                  |
| `autoOpenEnabled`        | `true`  | Arms browser auto-open for timed meetings with URLs                   |
| `alertLeadSeconds`       | `60`    | Alert fires this many seconds before browser open                     |
| `nativeNotifications`    | `true`  | OS Notification when a meeting auto-opens                             |
| `lateJoinGraceMinutes`   | `0`     | Optional post-start auto-open window (`0` = off)                      |
| `quietHoursEnabled`      | `false` | Suppress alert + notifications; auto-open continues                   |
| `quietHoursStart`/`End`  | `22:00`/`07:00` | Local quiet window (supports midnight wrap)                     |

## Calendar and permissions

GogMeet asks for Calendar access the first time it needs events. If macOS denies permission, the fetch returns a typed Calendar error and the UI shows the permission state.

The Swift helper prints one JSON array of exactly nine strings per line (JSON Lines):

```json
["uid", "title", "startISO", "endISO", "url", "calName", "allDay", "email", "notes"]
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
bun run verify:macos-release  # Verify a signed, notarized official release on macOS
```

`electron-builder.yml` creates deterministic `GogMeet-${version}-${arch}.${ext}` DMG and ZIP targets for both `arm64` and `x64`, writes artifacts to `dist/`, enables the hardened runtime and built-in app notarization, and keeps `src/main/googlemeet-events.swift` unpacked from ASAR so `swiftc` can read it. Local packaging remains usable without Apple release secrets; the official tag workflow does not.

There is also a local Apple Silicon DMG helper:

```bash
./build-macOS-dmg.sh                    # Build an arm64 DMG
./build-macOS-dmg.sh --environment beta  # Append an environment suffix to the DMG filename
./build-macOS-dmg.sh --help
```

The helper script installs dependencies, cleans `dist/`, builds the app, packages an arm64 DMG, signs with a Developer ID certificate when one is available, and uses ad-hoc signing otherwise.

## Release and CI

- PR checks run on macOS for pushes and pull requests to `develop` and `main`: the `check` job runs lint, formatting, type checking, a production build, and coverage; the Node 26 job validates generated icon drift.
- A `main` push only creates and pushes `v${package.json.version}` when it does not already exist. The separate `v*` tag run installs, requires nonempty `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`, runs `bun run package` once, verifies the containers, writes `SHA256SUMS.txt`, then uploads exactly arm64/x64 DMG/ZIP files plus that checksum file.
- The verifier mounts each DMG and extracts each ZIP to inspect the contained app. It validates signing, hardened runtime, Gatekeeper assessment, app stapling, entitlements, Swift-source packaging, and a native-architecture Swift smoke. The app is notarized and stapled before its containers are created; neither the ZIP nor the unsigned DMG container should be described as stapled or notarized.

### Runtime topology

Three distinct Node runtimes coexist; do not conflate them:

| Runtime                | Source                                 | Used for                                                                                                                        |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bun `1.3.14`           | `packageManager` + `oven-sh/setup-bun` | Primary dev/build/test/lint/package runner and package manager.                                                                 |
| Host Node `26`         | `.nvmrc` + `actions/setup-node`        | Icon generator (`scripts/generate-calendar-tray-icons.mjs`) and the release `node -p` tag step. Enforced by `bun run validate:node`. |
| Electron-embedded Node | Bundled inside Electron `^43.0.0`      | Runtime for the packaged main process. Independent of host Node 26.                                                             |

## Troubleshooting

### macOS blocks the app

Gatekeeper can block ad-hoc signed local builds. After copying the app to `/Applications`, use **System Settings → Privacy & Security → Open Anyway** or remove quarantine:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/GogMeet.app"
```

### Calendar events do not appear

1. Confirm Calendar permission in **System Settings → Privacy & Security → Calendars**.
2. Make sure the event contains a supported meeting URL in the event URL, location, or notes field.
3. Click the tray icon to open the menu (or click again to force a calendar refresh).
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

## Tech stack

| Layer           | Tech                                  |
| --------------- | ------------------------------------- |
| Runtime         | Electron `^43.0.0`                    |
| Language        | TypeScript `^6.0.3`                   |
| Build           | Rslib `^0.23.1` + Rsbuild `^2.1.2`    |
| Package         | Electron Builder `^26.15.3`           |
| Package manager | Bun `1.3.14`                          |
| Calendar        | Swift EventKit helper                 |
| Tests           | Vitest `^4.1.9` workspace             |
| Logging         | `electron-log` `^5.4.4`               |
| Updates         | `electron-updater` `^6.8.9`           |

## Contact

For questions or issues, contact [kennydizi@ocworkforces.com](mailto:kennydizi@ocworkforces.com).

## License

MIT
