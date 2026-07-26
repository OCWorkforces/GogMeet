# Platform — OS helpers

**Parent:** `src/main/AGENTS.md`

OS process-platform helpers. Do not confuse with `utils/platform.ts` (meeting host detection).

## FILES

| File | Role | Key Exports |
|------|------|-------------|
| `os.ts` | `process.platform` predicates | `isDarwin()`, `isWin32()` |

## NOTES

- Prefer these helpers over raw `process.platform === "…"` so call sites stay consistent and testable via module mock.
- Windows calendar providers and packaging live in later waves; this package stays leaf/pure.
