# Scripts

Repository automation scripts for local development and asset generation. Invoked by `package.json` or manually; not bundled into app runtime.

## Files

| File                                    | Role                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dev.ts`                                | Bun dev orchestrator: rslib watch for main/preload, rsbuild dev server, Electron launch                                                          |
| `generate-calendar-tray-icons.mjs`      | Sharp asset generator: tray PNGs (mac 18/36 + win 16/32), `build/icon.icns` (mac/iconutil), `build/icon.ico`, About SVG                          |
| `validate-node.mjs`                     | Host-Node 26 guard + icon generator under host Node (`bun run validate:node`)                                                                    |
| `verify-macos-release.mjs`              | Official macOS release verifier (DMG/ZIP inventory, signing, stapling, dual-source Swift smoke)                                                  |
| `macos-release-verifier-*.mjs`          | Helpers for mac verifier: container, pure helpers, injectable natives (dual Swift sources + dual-source `source.hash`)                           |
| `verify-windows-release.mjs`            | Windows release inventory (NSIS + portable x64/arm64; optional latest.yml)                                                                       |
| `merge-windows-latest-yml.mjs`          | Rebuilds `dist/latest.yml` listing both NSIS arches after sequential arch builds                                                                 |
| `next-beta-tag.mjs`                     | Pure helper for develop beta numbering: next `vX.Y.Z-beta-N` tag + app version                                                                   |
| `guardrails-scan.mjs`                   | Permanent P-NEVER scan (`bun run guardrails`); `--self-test` / `guardrails:self-test` for fixture mode                                           |
| `performance/report.mjs`                | Aggregate opt-in perf JSONL → p50/p95/min/max/sampleCount (`bun run perf:report`)                                                                |
| `performance/workspace-fingerprint.mjs` | Fixed-exclusion HEAD + tracked-diff + untracked manifest digests (`perf:workspace-fingerprint`)                                                  |
| `performance/measure-*.mjs`             | Lab harnesses: google-calendar, **tray/alert/startup/safe-storage** (packaged probe profile; synthetic never native), build-package (`perf:lab`) |
| `performance/helpers/*`                 | Shared stats + google-shadow + **packaged-probe** (isolated userData launch/cleanup) for lab scripts                                             |

## Script tests (`tests/scripts/`)

| Suite group                                                              | Covers                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `validate-node.test.ts`                                                  | Host Node major + skip-generate flag                                                                 |
| `guardrails-scan.test.ts`                                                | P-NEVER scanner + self-test fixtures                                                                 |
| `next-beta-tag.test.ts`                                                  | Beta tag / app version numbering                                                                     |
| `merge-windows-latest-yml.test.ts`                                       | Dual-arch latest.yml merge                                                                           |
| `verify-macos-release.test.ts` / `macos-release-verifier-native.test.ts` | Official mac verifier pure helpers + natives (both Swift sources + dual-source hash)                 |
| `verify-windows-release.test.ts`                                         | Windows artifact inventory                                                                           |
| `performance-*.test.ts`                                                  | report, tray, google, safe-storage, startup, alert, build-package, google-shadow, **packaged-probe** |
| `calendar-parser-bench-fixtures.test.ts`                                 | Bench fixture integrity                                                                              |

## Performance tooling

- **Not** PR quality gates. Weekly/manual collection: `.github/workflows/measurement.yml` + `docs/performance/measurement-lab.md`.
- Opt-in product traces use `GOGMEET_PERF_TRACE=1` + `src/main/utils/performance-trace.ts` (+ atomic file sink).
- Packaged probes: `helpers/packaged-probe.mjs` — finite modes, `gogmeet-perf-probe-` userData under tmpdir (separator-safe cleanup), 90s timeout TERM→KILL, copy only fixed JSONL to script `--output-dir`, recursive cleanup.
- Measure scripts exit **0** for `blocked` / threshold `rejected` / `retained`; exit **1** for launched `timeout` / `crash` / missing-trace. Tray retention uses **observed** skip rates only (no floor).
- Fingerprint exclusions are fixed (cannot be chosen by reviewers): `.omo/evidence/**`, `lib/**`, `dist/**`, `coverage/**`, `node_modules/**`, `.eslintcache`, `*.tsbuildinfo`.
- Tests: `tests/scripts/performance-*.test.ts`, `tests/scripts/guardrails-scan.test.ts`.
- Parser microbench is separate: `bun run bench:calendar-parser` → `vitest.bench.config.ts` (outside workspace).

## `dev.ts` Contract

- Shebang `#!/usr/bin/env bun`; run via `bun run dev`.
- Cleans `lib/main` and `lib/preload` before starting watches.
- Starts rslib watches for main + preload and Rsbuild on port `5173`.
- Waits for `lib/main/index.cjs` and `lib/preload/index.cjs`, then TCP-checks `localhost:5173` before Electron.
- Launches Electron with `--disable-gpu-sandbox`, `ELECTRON_ENABLE_LOGGING=1`, `VITE_DEV_SERVER_URL=http://localhost:5173`.
- SIGINT/SIGTERM and Electron exit kill all child processes.

## Icon Generation Contract

- Run with `bun scripts/generate-calendar-tray-icons.mjs` or Node.
- Outputs tray icons to `src/assets/`: mac dark/light 18/36, Windows dark/light 16/32.
- Outputs `build/icon.icns` via `iconutil` on macOS only; `build/icon.ico` via sharp on any OS.
- Keep `sharp` in devDependencies when editing this script.
- Do not hand-edit generated tray/icon assets.

## `validate-node.mjs` Contract

- Enforces host Node major ≥ 26 (`.nvmrc`), then runs the icon generator under the same host Node.
- `NODE_VALIDATE_SKIP_GENERATE=1` skips spawn for unit tests only.
- Pure helpers exported for `tests/scripts/validate-node.test.ts`.
- Host Node 26 is for contributor tooling — do not conflate with Electron's embedded runtime or lower `engines.node` (`>=20`).

## `next-beta-tag.mjs` Contract

- `computeNextBeta(base, tagList)` → `{ base, betaNumber, tag, appVersion }`.
- Tag form: `vX.Y.Z-beta-N`; app version form: `X.Y.Z-beta.N`.
- Used by `.github/workflows/beta-release.yml`; unit tests in `tests/scripts/next-beta-tag.test.ts`.

## Release version ownership

- Root `package.json` owns the official release version. The official release workflow creates the matching `v${package.json.version}` tag from `main` when needed.
- `next-beta-tag.mjs` derives a beta tag and Electron-compatible beta app version from that package version. Beta tags are owned by `.github/workflows/beta-release.yml`.
- The beta macOS and Windows jobs temporarily replace `package.json`'s version in their own CI checkouts before packaging. The beta tag points to the untouched `develop` commit, and the temporary mutation is never committed.

## `verify-macos-release.mjs` Contract

- macOS only; fail closed for missing/extra/wrong-version DMG/ZIP containers.
- Attach DMG read-only / extract ZIP with `ditto`; check signing, hardened runtime, stapling, entitlements, **both** unpacked Swift sources:
  - `…/app.asar.unpacked/src/main/googlemeet-events.swift`
  - `…/app.asar.unpacked/src/main/swift/event-occurrence-identity.swift`
- Swift cache smoke only from ZIP matching runner arch; isolated `TMPDIR`; accept helper exits `0`, `2`, or `3`.
- `source.hash` must match SHA-256 of **identity + `"\n"` + events** (same order as runtime `readSwiftSource`).
- `xcrun stapler validate` against the contained app only.
- Native command execution injectable via `macos-release-verifier-native.mjs`; pure helpers unit-tested.

## Anti-Patterns

- Do not replace the TCP readiness check with fixed sleeps in `dev.ts`.
- Do not remove stale-output cleanup; old `lib/` files cause Electron to launch stale code.
- Do not hard-code a different dev-server port without updating BrowserWindow loading assumptions.
- Do not hand-edit generated tray/icon assets when the script can regenerate them.
- Do not swap `scripts/dev.ts` away from Bun or rewrite package scripts to npm/yarn/pnpm.
- Do not add runtime shims to `validate-node.mjs` beyond `NODE_VALIDATE_SKIP_GENERATE`.
- Do not make the official macOS verifier permissive for unsigned local builds.
