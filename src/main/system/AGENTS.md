# System — macOS Integration Adapters

Leaf modules wrapping macOS and Electron platform APIs. Minimal business logic; orchestration stays in lifecycle.

## FILES

| File | Role |
| --- | --- |
| `power.ts` | Battery-aware poll interval (2min AC / 4min battery), ref-counted sleep prevention, resume/unlock hooks |
| `auto-launch.ts` | macOS login items via `app.setLoginItemSettings()` |
| `auto-updater.ts` | `initAutoUpdater()` — **called from lifecycle**; no-op when unpackaged; GitHub Releases feed |
| `notification.ts` | First-run notification permission dialog + System Settings deep link |
| `shortcuts.ts` | `Cmd+Shift+M` → `pickJoinTarget` + `joinMeetingById`; non-modal Notification feedback |

## CONVENTIONS

- Prefer leaf design: no imports of tray/windows/scheduler **internals**.
- `shortcuts.ts` may use `scheduler/facade.js` (`getLastKnownEvents`) and `domain/calendar.js` for live fetch fallback — keep join via `joinMeetingById`.
- Each module exposes init/cleanup called from `lifecycle.ts` where applicable.
- macOS-only product surface.

## ANTI-PATTERNS

- Never import `scheduler/index.js`, `poll.js`, or `state/*`.
- Never open meetings with raw `shell.openExternal` — use `joinMeetingById` / `openMeetingUrl`.
- Never call `allowSleep()` without matching `preventSleep()`.
- Never run auto-updater outside packaged builds (`app.isPackaged` gate inside module).
- Never import renderer/preload code.
