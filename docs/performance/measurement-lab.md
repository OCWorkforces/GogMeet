# Measurement lab (read-only evidence)

How to run the measurement harnesses that gate future optimization work.  
**No product code changes** come from these scripts. Receipts use `status`: `retained|rejected|blocked|skipped`.

## Safety

| Rule | Detail |
| --- | --- |
| Credentials | Optional `GOGMEET_GOOGLE_BENCH_TOKEN` — short-lived access token only. **Never** commit or log it. |
| Cache / tokens | Harnesses **must not** write `userData` token or offline cache stores. |
| Traces | Keep `GOGMEET_PERF_TRACE` off unless collecting redacted phase marks. |
| User content | Receipts use counts/markers only — no titles, emails, meet URLs. |

## Commands

```bash
# Synthetic / blocked-without-prereq (always safe)
bun run perf:google
bun run perf:tray
bun run perf:safe-storage
bun run perf:startup
bun run perf:alert
bun run perf:build-package

# Optional live / native (local or CI secrets)
export GOGMEET_GOOGLE_BENCH_TOKEN='ya29.…'   # never echo
bun run perf:google

GOGMEET_ELECTRON_TRAY_BENCH=1 bun run perf:tray
GOGMEET_ELECTRON_ALERT_BENCH=1 bun run perf:alert
GOGMEET_SAFE_STORAGE_TIMING=1 bun run perf:safe-storage
GOGMEET_APP_PATH="/path/to/GogMeet.app/Contents/MacOS/GogMeet" bun run perf:startup
GOGMEET_PERF_RUN_BUILD=1 bun run perf:build-package
```

Receipts write under `.omo/evidence/gogmeet-performance/` (gitignored).

## CI

Workflow `.github/workflows/measurement.yml` (manual / weekly):

- Runs synthetic harnesses on macOS + Windows
- Uploads receipt JSON as artifacts
- Does **not** fail the build on `blocked` / baseline `rejected`
- Live Google / Electron native timing only when secrets or flags are set

## Product follow-ups

Optimization product PRs require:

1. A terminal receipt of `retained` (or a superseding design doc)
2. Separate implementation plan (see `docs/plans/gogmeet-out-of-scope-follow-on.md`)
3. Permanent guardrails still green: `bun run guardrails`
