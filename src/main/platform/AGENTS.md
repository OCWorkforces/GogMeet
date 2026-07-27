# Platform — OS helpers

**Parent:** `src/main/AGENTS.md`

OS process-platform helpers. Do **not** confuse with `domain/services/platform.ts` (meeting host: Meet vs Zoom).

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `os.ts` | `process.platform` predicates | `isDarwin()`, `isWin32()` |

## NOTES

- Prefer these helpers over raw `process.platform === "…"` (testable via module mock).
- Leaf package: no calendar or Electron window logic here.
- Factory/tray/chrome/notifications branch on these helpers for dual-platform behavior.
