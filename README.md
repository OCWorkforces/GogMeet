# GogMeet

GogMeet is a macOS menu bar app for calendar meeting reminders. It checks your macOS Calendar through a Swift EventKit helper, lists upcoming meetings from the **native tray menu**, opens meeting links before they start, and can show a focused alert window when a meeting is close.

## Features

- Runs from the macOS menu bar without a Dock icon during normal use.
- Reads today's and tomorrow's Calendar events from EventKit, skipping cancelled and declined meetings.
- Finds Google Meet, Zoom, and Calendly links in an event's URL, location, or notes.
- Opens only allowlisted HTTPS meeting hosts. Google Meet gets `authuser=<email>` and Zoom gets `uname=<email>` when the Calendar account email is available.
- Auto-opens browser links 0–10 minutes before non-all-day meetings (default 1 minute; `0` means at start). Can be turned off in Settings.
- Optional full-screen alert before auto-open (lead time configurable). **Join** opens the meeting; **Dismiss** cancels that meeting's pending browser auto-open.
- Optional OS notifications when a meeting auto-opens; quiet hours can silence alerts and notifications without blocking auto-open.
- Native tray menu: Join, Copy Link, Join Next, Refresh, Settings, and About. Pre- and in-meeting countdown text beside the tray icon.
- Show or hide tomorrow's meetings in the tray menu.
- Can register itself as a macOS login item.
- Opens the current in-progress meeting if one is joinable, otherwise the next upcoming meeting, with `Cmd+Shift+M`.
- Packaged builds can check GitHub Releases for updates through `electron-updater` (when release assets include updater metadata such as `latest-mac.yml`) and install downloaded updates on quit.

## Screenshots

![Settings](assets/setting-page.png)

_Settings for auto-open timing, launch at login, tomorrow's meetings, alert, notifications, and quiet hours._

## Download

- **Official (Latest):** [GitHub Releases](https://github.com/OCWorkforces/GogMeet/releases) — signed and notarized builds from `main` / version tags.
- **Beta (pre-release):** same page, filter **Pre-release** — auto-built from `develop` as `vX.Y.Z-beta-N` (for example `v1.16.0-beta-1`). Prefer the DMG for your architecture (`arm64` Apple Silicon, `x64` Intel).

Unsigned or ad-hoc beta builds may be blocked by Gatekeeper; see [Troubleshooting](#troubleshooting).

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
| Renderer | `src/renderer/`        | `lib/renderer/`         | Vanilla TypeScript UI for list, settings, and alert pages                                   |
| Shared   | `src/shared/`          | Bundled into consumers  | Branded types, settings, IPC contracts, allowlist, errors, and pure utilities               |

Runtime files worth knowing:

- `src/main/domain/calendar.ts` calls the Swift integration and returns typed `CalendarResult` values (errors include a structured `code`).
- `src/main/googlemeet-events.swift` queries EventKit for a two-day range starting today and prints one JSON array of 9 strings per event line.
- `src/main/swift/` compiles and caches the Swift helper in `/tmp/googlemeet/`, keyed by the Swift source hash.
- `src/main/scheduler/facade.ts` is the public scheduler API. Polling runs every 2 minutes on AC power and every 4 minutes on battery; force polls coalesce within 10 seconds.
- `src/main/utils/join-meeting.ts` is the shared join path (menu, hotkey, renderer, alert): build identity URL, open, mark opened.
- `src/shared/meet-url-allowlist.ts` is the hostname allowlist source of truth; main re-validates at egress.
- `src/main/utils/browser-window.ts` centralizes secure BrowserWindow defaults (`sandbox`, `contextIsolation`, no Node integration).

## Settings

Defaults live in `src/shared/settings.ts` (schema version 2):

| Setting                 | Default         | Notes                                                              |
| ----------------------- | --------------- | ------------------------------------------------------------------ |
| `openBeforeMinutes`     | `1`             | Browser auto-open offset, clamped to 0–10 minutes (`0` = at start) |
| `launchAtLogin`         | `false`         | Syncs to macOS login items                                         |
| `showTomorrowMeetings`  | `true`          | Controls whether tomorrow's events appear in the tray menu         |
| `windowAlert`           | `true`          | Enables the pre-meeting alert window                               |
| `autoOpenEnabled`       | `true`          | Arms browser auto-open for timed meetings with URLs                |
| `alertLeadSeconds`      | `60`            | Alert fires this many seconds before browser open                  |
| `nativeNotifications`   | `true`          | OS Notification when a meeting auto-opens                          |
| `lateJoinGraceMinutes`  | `0`             | Optional post-start auto-open window (`0` = off)                   |
| `quietHoursEnabled`     | `false`         | Suppress alert + notifications; auto-open continues                |
| `quietHoursStart`/`End` | `22:00` / `07:00` | Local quiet window (supports midnight wrap)                      |

## Calendar and permissions

GogMeet asks for Calendar access the first time it needs events. If macOS denies permission, the fetch returns a typed Calendar error and the tray menu can show a permission-denied row with a link to Calendar privacy settings.

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
bun run package      # Build + package DMG and ZIP targets (--publish never)
bun run package:dir  # Build + create unpacked macOS app directory
bun run verify:macos-release  # Verify a signed, notarized official release on macOS
```

### Hardened runtime (keep enabled)

`electron-builder.yml` sets **`hardenedRuntime: true`**. Keep it on.

| Build type | Hardened runtime | What you need |
| --- | --- | --- |
| Local / CI without Apple secrets | Still `true` in config | Package skips Developer ID signing and notarize; Gatekeeper may block install — OK for development |
| Official / signed beta | Required | Developer ID (`CSC_LINK`, `CSC_KEY_PASSWORD`) + notarize env (`APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`) |

Hardened runtime is a **code-signing flag for distribution**, not what blocks unsigned apps on other Macs. Gatekeeper cares about **Developer ID signature + notarization**. Turning hardened runtime off does not make unsigned DMGs freely installable, and it would break notarization and `verify:macos-release` later.

### Notarization and publish

- **Notarize owner:** custom `afterSign` hook `build/notarize.cjs` (notarytool + staple + validate). `mac.notarize` stays `false` so Electron Builder and the hook do not double-notarize.
- Without Apple secrets, the hook logs a skip and packaging continues.
- **`package` / `package:dir` use `--publish never`.** GitHub upload is done by CI (`softprops/action-gh-release`), not by electron-builder during package. The `publish` block in `electron-builder.yml` is metadata for `electron-updater`, not a CI upload step.
- Swift source stays in `asarUnpack` so `swiftc` can read it at runtime.
- Artifact names: `GogMeet-${version}-${arch}.{dmg,zip}` under `dist/`.

There is also a local Apple Silicon DMG helper:

```bash
./build-macOS-dmg.sh                    # Build an arm64 DMG
./build-macOS-dmg.sh --environment beta  # Append an environment suffix to the DMG filename
./build-macOS-dmg.sh --help
```

The helper script installs dependencies, cleans `dist/`, builds the app, packages an arm64 DMG, signs with a Developer ID certificate when one is available, and uses ad-hoc signing otherwise.

## Release and CI

- **PR checks** (`.github/workflows/pr-check.yml`) run on macOS for pushes and pull requests to `develop` and `main`: lint, formatting, typecheck, production build, coverage; a separate Node 26 job validates generated icon drift.
- **Beta pre-releases** (`.github/workflows/beta-release.yml`): every push to `develop` publishes a GitHub **pre-release** with arm64/x64 DMG and ZIP. Tags auto-increment as `v${package.json.version}-beta-1`, `v${package.json.version}-beta-2`, … (example `v1.16.0-beta-1`). The embedded app version is `${version}-beta.N` (example `1.16.0-beta.1`). Signing/notarize run when Apple secrets are present; otherwise packaging is unsigned and Gatekeeper may block casual installs.
- **Official releases** (`.github/workflows/release.yml`): a `main` push ensures `v${package.json.version}` exists (creates it if missing) and **packages/uploads in the same workflow run** (GitHub does not re-trigger workflows for tags pushed with the default `GITHUB_TOKEN`). Non-beta `v*` tag pushes can also release. If Apple signing/notarize secrets are fully set (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`), the app is signed, notarized, and verified; if any secret is missing (including `CSC_LINK`), CI **falls back to an unsigned package** and skips `verify:macos-release` (Gatekeeper may block casual installs). Always uploads arm64/x64 DMG/ZIP + `SHA256SUMS.txt` as **Latest**.
- The official verifier mounts each DMG and extracts each ZIP, then validates the contained app (signing, hardened runtime, Gatekeeper, stapling, entitlements, Swift packaging, native Swift smoke). The app is notarized and stapled before containers are created; DMG/ZIP containers themselves are not described as stapled or notarized.

### Runtime topology

Three distinct Node runtimes coexist; do not conflate them:

| Runtime                | Source                                 | Used for                                                                                                                             |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bun `1.3.14`           | `packageManager` + `oven-sh/setup-bun` | Primary dev/build/test/lint/package runner and package manager.                                                                      |
| Host Node `26`         | `.nvmrc` + `actions/setup-node`        | Icon generator (`scripts/generate-calendar-tray-icons.mjs`) and the release `node -p` tag step. Enforced by `bun run validate:node`. |
| Electron-embedded Node | Bundled inside Electron `^43.0.0`      | Runtime for the packaged main process. Independent of host Node 26.                                                                  |

## Troubleshooting

### macOS blocks the app

Gatekeeper can block ad-hoc signed local builds and unsigned betas. After copying the app to `/Applications`, use **System Settings → Privacy & Security → Open Anyway** or remove quarantine:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/GogMeet.app"
```

Official releases that are Developer ID–signed, notarized, and stapled should open without this step.

### Calendar events do not appear

1. Confirm Calendar permission in **System Settings → Privacy & Security → Calendars**.
2. Make sure the event contains a supported meeting URL in the event URL, location, or notes field.
3. Open the tray menu and use **Refresh**, or click the tray icon to force a calendar poll.
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

| Layer           | Tech                               |
| --------------- | ---------------------------------- |
| Runtime         | Electron `^43.0.0`                 |
| Language        | TypeScript `^6.0.3`                |
| Build           | Rslib `^0.23` + Rsbuild `^2.1`     |
| Package         | Electron Builder `^26.15.3`        |
| Package manager | Bun `1.3.14`                       |
| Calendar        | Swift EventKit helper              |
| Tests           | Vitest workspace                   |
| Logging         | `electron-log` `^5.4.4`            |
| Updates         | `electron-updater` `^6.8.9`        |

## Contact

For questions or issues, contact [kennydizi@ocworkforces.com](mailto:kennydizi@ocworkforces.com).

## License

MIT
