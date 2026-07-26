# How to dogfood GogMeet on Windows

This guide is for engineers testing **Windows support** while it is still landing on `feature/windows-platform-support` (and related branches). It covers running from source, Google OAuth setup, optional fixtures, and what to verify.

**Status (Wave 4):** Google Calendar connect/list/auto-open path is implemented in code. Official NSIS packaging, Windows CI matrix, and auto-update are later waves—local dogfood today is primarily **`bun run dev`** on a Windows machine (x64 or arm64).

---

## What Windows dogfood is (and is not)

| Supported in Windows MVP dogfood | Not supported yet |
| --- | --- |
| **Google Calendar** only (OAuth) | Outlook / Microsoft 365 / local Windows Calendar |
| Tray menu as primary UI | macOS-style vibrancy / menu-bar title next to icon |
| Connect / reconnect / disconnect | Full EventKit multi-account parity |
| Meet / Zoom / Calendly join URLs | Linux |
| Auto-open + alert + `Ctrl+Shift+M` | Packaged auto-update (Wave 7+) |

macOS continues to use **EventKit** and is unaffected when you dogfood Windows.

---

## Prerequisites

### Machine

- Windows 10 (1809+) or Windows 11
- **x64** or **arm64**
- Internet access for Google OAuth and Calendar API

### Tooling

| Tool | Notes |
| --- | --- |
| **Git** | Clone the repo |
| **Bun** `>=1.3.0` | Primary package manager (`packageManager: bun@1.3.14`) |
| **Node** `>=20` (recommend **26** per `.nvmrc`) | Host tooling; Electron embeds its own runtime |

Install Bun on Windows: follow [bun.sh](https://bun.sh) for the current Windows install method, then:

```powershell
bun --version
node --version
```

### Google Cloud (required for real calendar data)

Use the **OCWorkforces existing GCP project** (do not invent a new org project unless infra asks you to).

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services.
2. Enable **Google Calendar API**.
3. **OAuth consent screen**
   - User type: Internal (if Workspace-only) or External in **Testing**.
   - Add yourself (and other dogfooders) as **Test users** while the app is in Testing (limit ~100 users).
   - Scopes used by GogMeet:
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `openid`
     - `email`
4. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Name: e.g. `GogMeet Windows dogfood`
5. Copy the **Client ID** (looks like `….apps.googleusercontent.com`).

**Redirect URI:** GogMeet uses **loopback PKCE** only:

```text
http://127.0.0.1:<ephemeral-port>/oauth/callback
```

The port is chosen at runtime. For Desktop clients, Google typically allows loopback without listing every port—if consent fails with `redirect_uri_mismatch`, confirm the client type is **Desktop** (not Web) and that you did not force a fixed redirect that does not match loopback.

You do **not** need to ship a client secret for dogfood PKCE; if GCP shows a secret for Desktop, treat it as non-confidential and do not put it in the repo.

---

## Setup

```powershell
git clone <repo-url> GogMeet
cd GogMeet
git checkout feature/windows-platform-support   # or your dogfood branch
bun install
```

### Set the OAuth client ID

**PowerShell (session):**

```powershell
$env:GOOGLE_OAUTH_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"
```

**PowerShell (user-level, persists):**

```powershell
[System.Environment]::SetEnvironmentVariable(
  "GOOGLE_OAUTH_CLIENT_ID",
  "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "User"
)
# Restart the terminal after setting User-level env vars
```

**cmd.exe:**

```bat
set GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

If this variable is missing or empty, the tray menu shows that OAuth is not configured and Connect stays disabled.

### Optional environment variables

| Variable | When to use |
| --- | --- |
| `GOGMEET_ALLOW_PLAINTEXT_TOKENS=1` | Only if `safeStorage` encryption is unavailable in your environment (unpackaged/dev). **Never** for production packaging. |
| `GOGMEET_CALENDAR_FIXTURE=C:\path\to\events.json` | Skip OAuth; load a JSON fixture (unpackaged only). See [Fixture mode](#fixture-mode-no-oauth). |

---

## Run from source

With `GOOGLE_OAUTH_CLIENT_ID` set:

```powershell
bun run dev
```

This starts Rslib/Rsbuild watch + Electron. On first launch:

1. Look for the **GogMeet** icon in the Windows **notification area** (system tray).  
   - If hidden, open the overflow caret (`^`) and pin GogMeet.
2. **Left-click or right-click** the tray icon to open the context menu.
3. Choose **Connect Google Calendar…**.
4. Complete Google consent in the browser.
5. Return to the tray; after connect, a poll should list meetings (or “No upcoming meetings”).

### Cold-start acceptance (MVP)

Install/run → tray icon → open menu → **Connect Google Calendar…** is visible **without** needing the BrowserWindow popover.

---

## Connect, disconnect, and settings

### Tray menu (primary UI)

| State | What you should see |
| --- | --- |
| Not connected | “No calendar connected” + **Connect Google Calendar…** |
| Connecting | “Connecting to Google…” |
| Connected | Optional “Connected as you@…” + meeting list |
| Error | Error snippet + **Retry** / **Reconnect…** |
| Connected actions | **Disconnect Google Calendar** |

Also available: Settings…, About GogMeet, Quit (`Ctrl+Q` accelerator when the menu supports it).

### Settings window

Open **Settings…** from the tray menu.

- **Google Calendar** section: connect / reconnect / disconnect and status text.
- Meeting preferences (open-before minutes, launch at login, tomorrow’s meetings, window alert) work the same as macOS conceptually.

### Global shortcut

- **`Ctrl+Shift+M`** — join the next upcoming meeting that has a URL (same `CmdOrCtrl+Shift+M` binding as macOS).

---

## What to verify (checklist)

Use a Google account that has **today/tomorrow** meetings with Meet, Zoom, or Calendly links.

- [ ] Tray icon appears; menu opens without crashing.
- [ ] Without `GOOGLE_OAUTH_CLIENT_ID`, Connect is disabled / explains missing config.
- [ ] With client ID, **Connect** opens the browser; cancel path does not hang forever (timeout ~5 minutes).
- [ ] After consent, meetings appear (or empty state is honest).
- [ ] Meeting rows open the correct join URL (allowlisted hosts only).
- [ ] Auto-open fires 1–5 minutes before start when settings allow.
- [ ] Optional window alert appears near meeting time; dismiss cancels that open.
- [ ] **Disconnect** clears local session; menu returns to Connect CTA.
- [ ] After disconnect, reconnect works.
- [ ] Airplane mode / network failure after a successful sync: app prefers **offline cache** when available (encrypted under userData).
- [ ] `Ctrl+Shift+M` opens the next meeting URL when one exists.
- [ ] Launch at login toggle (may need a reboot/sign-out cycle to confirm).

### Token and cache locations (for debugging)

Under Electron `userData` (typical path):

```text
%APPDATA%\gogmeet\
  calendar-auth\google.enc      # OAuth tokens (encrypted)
  calendar-cache.enc            # Last successful event list (encrypted)
  settings.json
```

Exact folder name follows Electron’s `app.getPath("userData")` (product name / app id). If connect “succeeds” but lists are empty, check that Calendar API is enabled and the test user has events in the next two local days.

To force a clean OAuth slate: quit the app, delete `calendar-auth\google.enc` (and optionally `calendar-cache.enc`), restart.

---

## Fixture mode (no OAuth)

For UI/scheduler dogfood without Google:

1. Create a JSON file (array or `{ "events": [ ... ] }`).

Example `C:\temp\gogmeet-fixture.json`:

```json
[
  {
    "id": "dogfood-1",
    "title": "Dogfood Standup",
    "startDate": "2026-07-26T16:00:00.000Z",
    "endDate": "2026-07-26T16:30:00.000Z",
    "calendarName": "Work",
    "isAllDay": false,
    "meetUrl": "https://meet.google.com/abc-defg-hij",
    "userEmail": "you@example.com"
  }
]
```

Use **ISO UTC** times near “now” so the meeting appears as upcoming.

2. Run unpackaged only:

```powershell
$env:GOGMEET_CALENDAR_FIXTURE = "C:\temp\gogmeet-fixture.json"
# Optional: omit GOOGLE_OAUTH_CLIENT_ID in fixture mode
bun run dev
```

**Rules (K23):**

- Fixture is used only when **`!app.isPackaged`** and the env path is non-empty.
- Packaged builds **ignore** `GOGMEET_CALENDAR_FIXTURE` even if set.

---

## Packaging note (later waves)

Windows NSIS/portable packaging and CI release jobs are planned in Waves 6–7. Until those land:

| Goal | Approach |
| --- | --- |
| Day-to-day dogfood | `bun run dev` on Windows with `GOOGLE_OAUTH_CLIENT_ID` |
| Unsigned installers | Follow design doc / `package:win` scripts once merged |
| Code signing | Optional; unsigned dogfood is expected to show SmartScreen warnings |

Do not treat macOS `bun run package` output as a Windows build.

---

## Troubleshooting

| Symptom | Likely cause | What to try |
| --- | --- | --- |
| “Set GOOGLE_OAUTH_CLIENT_ID to enable” | Env not set in the shell that launched Electron | Export the var, restart `bun run dev` from that shell |
| Browser opens then “denied” / no connect | Consent cancelled, wrong client type, or not a test user | Add Test user; confirm Desktop OAuth client |
| `redirect_uri_mismatch` | Client is Web application with fixed URIs | Use **Desktop** client; loopback PKCE |
| Connect works, always empty list | No events in local today→+2 days window, or Calendar API off | Create a timed meeting; enable Calendar API |
| Tokens not saved | `safeStorage` unavailable | Dev only: `GOGMEET_ALLOW_PLAINTEXT_TOKENS=1` |
| Tray icon missing | Hidden in overflow | Check notification area overflow; restart app |
| Second instance weirdness | Two Electron processes | Quit all GogMeet processes; single-instance lock should exit the second |
| Outlook meetings missing | Expected | Windows MVP is Google-only; Graph is Phase 2 |

### Logs

In dev, check the terminal that ran `bun run dev`. Main-process logs are prefixed with tags such as:

- `[calendar:auth]`
- `[calendar:google]`
- `[calendar:factory]`
- `[scheduler]`
- `[tray]`

---

## Security reminders for dogfooders

- Do **not** commit `GOOGLE_OAUTH_CLIENT_ID` into source if policy forbids it; use env or private CI secrets.
- Do **not** commit `google.enc`, fixture files with real PII, or screen recordings that include access tokens.
- Prefer **Testing** consent + allowlisted test users until product verification is intentional.
- Treat any Desktop client secret as public; rotation is by new client ID + wipe of local `google.enc` (clientId mismatch clears tokens).

---

## Related docs

| Doc | Purpose |
| --- | --- |
| [windows-platform-support-design.md](./windows-platform-support-design.md) | Full architecture, waves, packaging, CI |
| [README.md](../README.md) | macOS product overview and general dev commands |
| `src/main/calendar/AGENTS.md` | Calendar provider / factory rules in code |

---

## Quick reference

```powershell
# 1) Env
$env:GOOGLE_OAUTH_CLIENT_ID = "….apps.googleusercontent.com"

# 2) Install + run
bun install
bun run dev

# 3) Tray → Connect Google Calendar… → consent → verify meetings

# Optional fixture (no OAuth)
$env:GOGMEET_CALENDAR_FIXTURE = "C:\temp\gogmeet-fixture.json"
bun run dev
```

When packaging and release pipelines for Windows are merged, extend this document with exact `package:win:*` commands, artifact names, and SmartScreen/signing steps.
