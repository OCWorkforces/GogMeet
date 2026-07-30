# Packaging & startup product notes (deferred)

**Status:** Documentation only — no product packaging changes in this track  
**Plan:** Track C5 in `docs/plans/gogmeet-out-of-scope-follow-on.md`  
**Updated:** 2026-07-30

## Scope of this note

Wave C5 is **not** shipping electron-builder, locale, or startup reorder product changes without terminal measurement receipts (`retained`). This file records the conservative candidates and hard constraints so future work does not re-litigate safety.

## Candidates (evidence-gated)

| Candidate | Measurement gate | Must preserve |
| --- | --- | --- |
| Async safeStorage / token IO | B3 `retained` | Ciphertext integrity; no packaged plaintext fallback |
| electron-builder compression / locale prune | B6 baselines + A/B | `merge:windows-latest-yml`; dual-arch Windows artifacts |
| Startup reorder (defer updater) | B4 phase evidence | No auto-OAuth on Windows; tray usable within UX budget |
| Bundled Swift helper (related C2) | B4 helper-phase dominance + signing | Integrity recompile path; TCC/EventKit flows |

## Non-goals (permanent)

- Disable `safeStorage` or ship packaged plaintext token fallback
- Dual-arch single NSIS for official Windows releases
- Overwriting `latest.yml` without the merge script
- Auto-OAuth on Windows lifecycle
- Claiming packaging “wins” without B-wave receipts

## Runtime helper preference (C2-d shipped runtime only)

When a **signed** helper is present under `process.resourcesPath` (optional), the binary manager may copy it into the secure cache and skip compile-on-device. Unpackaged / missing helper still compile-on-device. Full C2 packaging pipeline (CI signed artifacts, notarization) remains external.

## When to open a product PR

1. Attach B-wave receipt with terminal disposition `retained` (or an explicit product superseding plan).  
2. One candidate per PR stack.  
3. Re-run `bun run guardrails` + package verify scripts for the touched platform.
