# Measurement lab (read-only evidence)

How to run the measurement harnesses that gate future optimization work.  
**No product optimizations** ship from these scripts. Receipts use `status`: `retained|rejected|blocked|skipped` and must carry `productChange: "none"`.

Active plan: `docs/plans/gogmeet-performance-stability-hardening.md`.

## Safety

| Rule | Detail |
| --- | --- |
| Credentials | Optional `GOGMEET_GOOGLE_BENCH_TOKEN` — short-lived access token only. **Never** commit or log it. |
| Probe userData | Packaged probes write **only** under disposable dirs: `os.tmpdir()/gogmeet-perf-probe-*` via Electron `--user-data-dir`. Parent scripts delete the root in `finally`. |
| Product userData | Harnesses must not write the default app userData token/cache stores. |
| Traces | `GOGMEET_PERF_TRACE=1` only for probes; fixed file `gogmeet-perf-trace-v1.jsonl`; caps 1024 rows / 1 MiB; no secret/user-content fields. |
| Paths | No caller/env-controlled product trace path — fixed basename under isolated userData only. Evidence copies go to script-level `--output-dir`. |
| Architecture | Native success requires host platform/arch matching artifact arch. Cross-built arm64 on x64 is `blocked/native-runner-unavailable`. |
| Retained | A `retained` receipt authorizes **only** a separate user-approved optimization plan. It never flips product code in this lab. |

## Status semantics

| Status | Meaning |
| --- | --- |
| `blocked` | Prerequisite missing (no package, wrong OS/arch, secret absent). Truthful non-failure for native claims. |
| `rejected` | Probe ran but thresholds/variance/partition failed. |
| `retained` | Thresholds met; still `productChange: "none"`. Follow-up plan required for any optimization. |
| crash/timeout | Parent exits nonzero — **not** blocked success. |

## Commands

```bash
# Synthetic / blocked-without-prereq (always safe)
bun run perf:google
bun run perf:tray
bun run perf:safe-storage
bun run perf:startup
bun run perf:alert
bun run perf:build-package

# Packaged native (host-matching directory package required)
bun run package:mac:dir   # or package:win:dir on Windows
export GOGMEET_APP_PATH="/path/to/GogMeet.app/Contents/MacOS/GogMeet"  # or .exe
bun run perf:startup -- --output-dir .omo/evidence/local/startup
bun run perf:tray -- --output-dir .omo/evidence/local/tray
bun run perf:alert -- --output-dir .omo/evidence/local/alert
# Windows x64 only for meaningful safeStorage native timing:
bun run perf:safe-storage -- --output-dir .omo/evidence/local/safe-storage

# Optional live Google (local/CI secret)
export GOGMEET_GOOGLE_BENCH_TOKEN='ya29.…'   # never echo
bun run perf:google
```

Receipts write under `.omo/evidence/` (gitignored). Never commit `.omo/evidence/`.

## CI

Workflow `.github/workflows/measurement.yml` (manual / weekly):

- **Synthetic** job on macOS + Windows: script unit tests + harnesses without package (`blocked` OK)
- **Native macOS** job: `package:mac:dir` then startup/tray/alert with `GOGMEET_APP_PATH`
- **Native Windows x64** job: `package:win:dir` then startup/tray/alert/safeStorage; arm64 artifact explicitly blocked
- Uploads receipts with `if: always()`
- Does **not** gate PRs; release/beta workflows unchanged
- Launched probe crash/timeout fails the native job (not silent success)

## Product follow-ups

Optimization product PRs require:

1. A terminal receipt of `retained` with `productChange: "none"`
2. A **separate** user-approved implementation plan
3. Permanent guardrails still green: `bun run guardrails`
