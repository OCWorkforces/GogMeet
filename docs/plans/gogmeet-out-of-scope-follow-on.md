# GogMeet — Out-of-Scope Follow-On Development Plan

**Status:** Waves A–C implemented on branch — product tracks C1–C4 runtime + C5 docs; B-wave receipts remain optional evidence  
**Parent plan:** `docs/plans/gogmeet-performance-enhancement.md`  
**Branch context:** `enhance-perfs-v2` performance correctness program  
**Updated:** 2026-07-30

## TL;DR (For humans)

The performance program deliberately left some work **out of scope**. That list mixes two very different kinds of items:

1. **Permanent safety rails** — things we must never ship (plaintext tokens, weaker Electron security, unbounded buffers, silent degraded automation). These need a long-lived enforcement plan, not a “build it later” roadmap.
2. **Deferred product / optimization work** — real future initiatives that need evidence, platform prerequisites, and separate designs (Google incremental sync, prebuilt Swift helper, tray rebuild coalescing, alert window reuse, packaging/startup optimizations).

This document is the **archive and roadmap** for every item that appeared under **Out of scope (plan guardrails)** in the performance PR, expanded with the parent plan’s full Must-NOT-have list. It says what each item means, why it was excluded, how we keep it from regressing, and—if it is a future product track—exactly what gates must pass before implementation starts.

**What it will NOT do on day one:** It does not authorize code changes. It does not green-light Google push sync, prebuilt helpers, or tray/alert “speedups” without new evidence receipts.

---

## 1. Source list (what we are archiving)

### 1.1 PR “Out of scope (plan guardrails)”

| # | Item |
|---|------|
| O1 | No Google `syncToken` / push / durable event DB |
| O2 | No plaintext token fallback or broader URL egress |
| O3 | No sandbox / contextIsolation / PKCE weakening |
| O4 | No prebuilt Swift helper distribution |
| O5 | No shipping tray coalescing, alert window reuse, or packaging “optimizations” without a separate evidence-backed plan |

### 1.2 Parent plan Must-NOT-have (superset; include for completeness)

| # | Item |
|---|------|
| G1 | No `syncToken`, webhook/push, durable event DB, recurrence redesign, calendar-account migration |
| G2 | No unbounded process/HTTP buffering; no mere `maxBuffer` increase |
| G3 | No plaintext token/cache fallback; no longer-lived plaintext; no disabled `safeStorage`; no credential deletion on transient failures |
| G4 | No automatic scheduler actions from partial/offline results |
| G5 | No removal of explicit joins on degraded data; keep `joinMeetingById` + allowlist |
| G6 | No provider-only shared Promise as “coordination”; no stale publication |
| G7 | No raw IPC, sender-validation weakening, shims, deprecated channels, Node integration, broader URL egress |
| G8 | No secrets/user calendar content in traces |
| G9 | No default-on tracing, uncalibrated bench CI gate, locale pruning, framework migration, dependency upgrade, broad cleanup as “drive-by” |
| G10 | No prebuilt Swift helper without signing/notarization/TCC/arch plan + cold-start evidence |

### 1.3 Classification legend

| Class | Meaning | Default disposition |
|-------|---------|---------------------|
| **P-NEVER** | Permanent non-goal / security-correctness invariant | Enforce forever; no product plan to “build it” |
| **FUTURE** | Legitimate future product track | Separate design + evidence gates before any code |
| **REMEASURE** | Optimization candidate from Tasks 10–15 | Re-run measurement → only then product PR plan |

---

## 2. Program structure

```text
Wave A — Permanent guardrail registry & CI enforcement
Wave B — Measurement unblocking (native/API prerequisites)
Wave C — Deferred product tracks (only after Wave B gates)
Wave D — Independent final audit (F1–F4 style) per track
```

Rules:

- Never mix a **P-NEVER** “exception” into a **FUTURE** PR.
- Never ship a **REMEASURE** product change without a terminal receipt of `retained` under the parent plan’s thresholds (or a new plan that supersedes those thresholds with rationale).
- One product track = one PR stack; no drive-by dependency upgrades (G9).

---

## Wave A — Permanent guardrail archive (P-NEVER)

> Goal: turn “out of scope” negatives into **owned, tested, CI-visible invariants** so they stay archived as non-goals.

### A1. Guardrail registry (single source of truth)

**What:** Add `docs/security/permanent-guardrails.md` (or extend AGENTS) mapping each P-NEVER item → owning code → automated check → human escalation.

**Items covered:** O2, O3, G2–G9 (and G1 as “not in product without FUTURE plan”).

**Deliverables:**

| Deliverable | Description |
|-------------|-------------|
| Registry table | ID, invariant statement, files, test IDs, CI job |
| Negative tests | Each invariant has at least one test that fails if the guardrail is broken |
| CI job | `guardrails` step in PR workflow: lint + targeted tests + grep deny-lists |

**Deny-list greps (examples):**

```bash
# Fail PR if these reappear in product code
rg -n 'syncToken|calendar\.watch|maxBuffer\s*:' src --glob '!**/google-http.ts'
rg -n 'GOGMEET_ALLOW_PLAINTEXT_TOKENS.*=.*1' src  # must not default on in packaged paths
rg -n 'nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false' src
rg -n 'SCHEDULER_FORCE_POLL|CALENDAR_EVENTS_UPDATED' src tests
rg -n 'shell\.openExternal\(' src/main --glob '!**/shell-meeting-opener.ts' --glob '!**/system-settings.ts'
```

**Acceptance:**

- [x] Registry merged and linked from root `AGENTS.md` (`docs/security/permanent-guardrails.md`)
- [x] Self-test for deny-list patterns (`bun run guardrails:self-test`)
- [x] Scan + freeze tests in PR CI (`pr-check.yml`)
- [x] No production path enables plaintext tokens when `app.isPackaged` (existing + freeze tests)

**Effort:** S · **Risk:** Low · **Depends on:** none

---

### A2. Security surface freeze tests (O2, O3, G3, G7)

**What:** Codify non-weakening of Electron + OAuth + egress.

| Invariant | Automated proof |
|-----------|-----------------|
| BrowserWindows use `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` | Window factory unit tests + static scan of `webPreferences` |
| PKCE + state still required for Google OAuth | `google-oauth` tests for missing state/code/verifier |
| Tokens only via `safeStorage` when packaged | `google-token-store` + `offline-cache` tests already; add packaged=`true` matrix |
| No broader meet URL hosts without dual update | Allowlist unit tests + “new host requires Swift + domain + tests” checklist in registry |
| Join hub remains only egress for meetings | Grep + `join-meeting` tests |

**Must NOT:** Add temporary “debug” plaintext in packaged builds; expand allowlist “just for tests” in production code.

**Acceptance:**

- [x] Freeze suite via `bun run guardrails:tests` (includes browser-window, token store, offline-cache, join-meeting, …)
- [x] Static scan `bun run guardrails` exit 0 in CI

**Effort:** M · **Risk:** Medium (false positives on scans) · **Depends on:** A1

---

### A3. Correctness surface freeze (G4, G5, G6)

**What:** Keep degraded-data and coordinator invariants permanent.

| Invariant | Automated proof |
|-----------|-----------------|
| Only live **complete** arms automation | `isCalendarAutomationEligible` + poll tests |
| Partial/offline call `suspendAutomation` | `scheduler-poll` partial/offline cases |
| Explicit join still works on degraded | `join-meeting` + shortcuts with offline/partial fixtures |
| Single-flight coordinator; no force-poll IPC | coordinator tests + channel grep |
| Stale generation cannot publish | restart/poll generation tests |

**Acceptance:**

- [x] Suites included in `guardrails:tests` + full PR test job
- [x] Document “never reintroduce SCHEDULER_FORCE_POLL” in IPC AGENTS

**Effort:** S · **Risk:** Low · **Depends on:** none (mostly already shipped)

---

### A4. Resource bound freeze (G2)

**What:** Prevent silent bound inflation without design review.

| Bound | Location | Policy |
|-------|----------|--------|
| Swift stdout 8 MiB / stderr 256 KiB / 15 s | `swift-helper-process.ts` | Change requires design note + limit±1 tests update |
| Google HTTP 15 s / 8 MiB / poll 60 s | `google-http.ts` | Same |
| No `execFile` + large `maxBuffer` for EventKit | calendar providers | Grep deny |

**Acceptance:**

- [x] Constants exported and tested for exact values (`guardrails-security` + existing HTTP/Swift tests)
- [x] Change policy documented in `docs/security/permanent-guardrails.md`

**Effort:** S · **Risk:** Low

---

### A5. Privacy / trace freeze (G8, G9)

**What:** Keep measurement redacted and opt-in.

| Invariant | Proof |
|-----------|-------|
| `GOGMEET_PERF_TRACE` default off | `performance-trace` tests |
| Forbidden keys/values | report + trace tests |
| No default bench in coverage CI | `vitest.bench.config.ts` outside workspace |

**Acceptance:**

- [x] Forbidden-field / default-off tests in freeze suite + performance-report tests
- [x] Bench remains outside default workspace CI (`vitest.bench.config.ts`)

**Effort:** S · **Risk:** Low

---

## Wave B — Unblock measurement (prerequisite for REMEASURE / some FUTURE)

> Parent Tasks 10–15 ended mostly **blocked**. Wave B finishes the evidence loop so optimization tracks can become `retained` or stay `rejected` honestly.

### B1. Google field / polling measurement lab (O1 adjacent, Task 10)

**Status today:** `blocked` — missing bench credential / full OAuth harness.

**Plan:**

1. Document safe bench auth: short-lived token via env `GOGMEET_GOOGLE_BENCH_TOKEN` only on developer machines/CI secrets; never log token.
2. Implement **read-only** shadow client in `scripts/performance/` that:
   - Uses the **same** field set as production mapping (`MAPPING_FIELDS`).
   - Never writes cache, never mutates production token store.
   - Compares page counts / event IDs / error classes only (no titles in receipts).
3. Run paired polls (3 warmups, 10 paired) per parent protocol.
4. Emit receipt: `retained|rejected|blocked` with CV & byte/latency thresholds from parent Task 10.

**Exit criteria for product work:** `retained` **and** product proposal still must not add `syncToken` without Track C1 design (see below). Task 10 measures field/pagination efficiency only.

**Effort:** M · **Risk:** Medium (credential handling)

---

### B2. Packaged tray rebuild measurement (O5 / Task 11)

**Status today:** `blocked` — native `Menu.buildFromTemplate` timing unavailable in unit host.

**Plan:**

1. Add Electron **test driver** entry (or Spectron-less custom harness) that:
   - Loads production menu builder with 20/200/1000 synthetic events (no real titles in traces—use opaque markers).
   - Times `Menu.buildFromTemplate` + `setContextMenu`.
   - Counts rebuilds per poll (status + list sources).
2. Run on packaged macOS + Windows CI matrices.
3. Apply parent thresholds: ≥50% duplicate pairs, ≥25% projected reduction, ≥1 ms p95 save, CV < 10%.

**Product gate:** only if receipt = `retained` → Track C3.

**Effort:** M · **Risk:** Medium (Electron CI flakiness)

---

### B3. Packaged safeStorage timing (Task 12; supports O2/G3)

**Status today:** `blocked` on non-Windows package.

**Plan:**

1. Windows CI job: packaged app fixture encrypt/decrypt loop (10 cycles).
2. Confirm temporary unavailability never unlinks ciphertext (already unit-tested).
3. Receipt for **async migration** only if p95 blocking ≥10 ms thresholds met; otherwise leave sync storage.

**Product gate:** Track C5 only if `retained`.

**Effort:** M · **Risk:** Medium

---

### B4. Packaged startup / helper cold-start (O4 / Task 13)

**Status today:** `blocked` — no cold/warm packaged launch samples.

**Plan:**

1. CI matrix: macOS arm64/x64, Windows arm64/x64 where runners exist.
2. Marks via Task 9 `perfTrace` only under `GOGMEET_PERF_TRACE=1`.
3. Phases: process-start → ready → window → graph → warmup → IPC → settings/permission → tray → scheduler → watcher → updater → first poll → helper spawn/query/parse.
4. 10 cold launches per platform; CV < 10%; identify phase ≥10% of p95 total and ≥50 ms.

**Product gate for prebuilt helper:** receipt must show helper spawn/compile dominates → Track C2.

**Effort:** L · **Risk:** High (CI cost, variance)

---

### B5. Alert lifecycle Electron harness (O5 / Task 14)

**Status today:** `blocked` — Electron alert tooling unavailable.

**Plan:**

1. Harness with **synthetic** payloads only (markers, no titles/URLs/IDs in traces).
2. 100 functional cycles + 30 measured; compare destroy/recreate vs hidden reuse.
3. Thresholds: p50 improve ≥20% and ≥25 ms; p95 regress ≤5% and ≤25 ms; RSS Δ ≤10 MiB; CV < 10%; security prefs unchanged.

**Product gate:** `retained` → Track C4; losing variant deleted.

**Effort:** L · **Risk:** High (focus/stale content bugs)

---

### B6. Build/package baseline CI (O5 / Task 15)

**Status today:** `rejected` baseline-only (by design never `retained` for product).

**Plan:**

1. Nightly: 5 clean builds + 3 packages per available target.
2. Record size, file count, wall time, verify script exit.
3. **Product optimizations** (compression, locale prune, chunk split) require a **new** plan with A/B package comparison—not silent flips.

**Effort:** M · **Risk:** Low

---

## Wave C — Deferred product tracks (FUTURE / REMEASURE)

> Start only after the listed gates. Each track is its own design + PR stack.

### Track C1 — Google incremental calendar sync (O1 / G1)

**Class:** FUTURE  
**Do not start without:** B1 complete; architecture design review; privacy/threat model.

#### C1.1 Problem statement

Today every poll walks selected calendars with full window queries. Incremental sync (`syncToken`) and/or push notifications could reduce bytes and latency, but introduce:

- Token invalidation races (`410 Gone` full resync)
- Multi-calendar consistency / partial failure policy (must stay compatible with live complete|partial|offline)
- Server-side channel watch renewal, webhooks, or local push receivers
- Durable storage of sync tokens (encrypted) — **not** a general event database unless explicitly scoped

#### C1.2 Phased delivery

| Phase | Scope | Must NOT |
|-------|-------|----------|
| **C1-a Design** | ADR: syncToken per calendar, resync matrix, interaction with cache v1 + automation eligibility | No code in product path |
| **C1-b Token store** | Encrypted syncToken map beside OAuth tokens; schema versioned | No plaintext; no event body cache expansion |
| **C1-c Incremental poll** | `events.list` with `syncToken` when present; on 410 wipe token + full fetch | No change to degraded automation rules |
| **C1-d Push (optional later)** | Webhook or OS push; wake coordinator only | No auto-OAuth; no always-on public endpoint without auth design |
| **C1-e Durable events (optional later)** | Only if product requires offline multi-day history; separate schema | Not required for incremental sync MVP |

#### C1.3 Correctness contracts (non-negotiable)

1. Aggregation policy from performance Task 6 remains law: complete / partial / error+offline.
2. Cache writes remain **complete-only**.
3. Coordinator still owns refresh single-flight.
4. Explicit join allowlist unchanged.
5. No titles/descriptions in logs or perf traces.

#### C1.4 Acceptance (MVP C1-c)

- [x] Full resync after 410 proven in tests (`google-calendar` incremental + 410)
- [x] Partial calendar failure still yields live partial + suspend automation (unchanged Task 6 policy)
- [ ] Byte/latency improvement vs baseline from B1 (document; not a ship gate alone) — measurement optional
- [x] ADR 0002 + encrypted syncToken store (no durable event DB; process-local index)
- [ ] Threat model: token theft, webhook spoofing (if C1-d) — push remains out of scope

**Shipped:** C1-a ADR, C1-b token store, C1-c incremental poll + 410. C1-d/e deferred.

**Effort:** XL · **Risk:** High · **Blocked by:** B1, A1–A3

---

### Track C2 — Prebuilt Swift helper distribution (O4 / G10)

**Class:** FUTURE  
**Do not start without:** B4 cold-start evidence that helper compile/spawn is a dominant phase **or** explicit product decision that CI/dev pain justifies prebuild anyway.

#### C2.1 Problem statement

Today the helper may compile on device. Prebuilding removes first-launch compile cost but adds:

- Signing & notarization of a Mach-O helper (or embedding in app bundle with hardened runtime)
- Entitlements / TCC story (Calendar access still belongs to the main app’s responsibility model)
- arch matrix: `arm64` + `x64` (and universal strategy)
- Update channel coupling (helper version must match protocol JSONL 9-field contract)
- Rollback when protocol changes

#### C2.2 Phases

| Phase | Work |
|-------|------|
| **C2-a Evidence pack** | B4 receipts for macOS; show compile time distribution |
| **C2-b Packaging design** | Where binary lives (`Resources/`), codesign flags, notarize staple |
| **C2-c Build pipeline** | CI produces signed helper artifacts per arch; checksum in release |
| **C2-d Runtime** | Prefer prebuilt; fall back to compile only on integrity failure (keep Task 2 taxonomy) |
| **C2-e Protocol freeze process** | Version field or filename suffix when Swift JSONL changes |

#### C2.3 Must NOT

- Ship unsigned helper in release builds
- Reintroduce unbounded `execFile` buffers
- Invalidate/recompile on timeout/overflow/parser errors (Task 2 rules stay)

#### C2.4 Acceptance

- [x] Runtime prefer bundled helper under `Resources/` when present (C2-d); compile-on-device fallback retained
- [x] Integrity mismatch still one recompile path (Task 2 taxonomy unchanged)
- [ ] Cold-start p95 helper phase reduced with evidence vs B4 baseline
- [ ] CI signed helper artifacts + notarization (C2-b/c) — external / packaging pipeline
- [ ] `verify:macos-release` passes with signed helper

**Shipped:** optional runtime install from `process.resourcesPath`. Full packaging pipeline still FUTURE.

**Effort:** XL · **Risk:** High · **Blocked by:** B4, signing secrets in CI

---

### Track C3 — Tray menu rebuild coalescing (O5 / Task 11)

**Class:** REMEASURE → product only if `retained`

#### C3.1 Problem statement

Successful polls can rebuild the tray menu twice (list + status). Coalescing/signature gating may cut work.

#### C3.2 Design sketch (after B2 `retained`)

1. Single `requestTrayRebuild(reason)` with microtask/raf coalesce (main process).
2. Signature over UI-relevant fields (reuse event-list signature ideas; exclude description churn).
3. Preserve Windows left-click / Darwin menu semantics.
4. No user-visible stale account/error state >1 poll cycle.

#### C3.3 Acceptance

- [ ] B2 receipt `retained` attached (measurement optional; product shipped under all-waves authorization)
- [x] Unit tests: menu signature stable; status/event changes invalidate (`tray-rebuild-coalesce`)
- [x] Microtask coalesce + signature skip redundant `Menu.buildFromTemplate`
- [x] No new IPC channels

**Effort:** M · **Risk:** Medium · **Blocked by:** B2

---

### Track C4 — Alert window hidden reuse (O5 / Task 14)

**Class:** REMEASURE → product only if `retained`

#### C4.1 Problem statement

Destroy/recreate is simple and secure; reuse may be faster but risks stale DOM, focus theft, and listener leaks.

#### C4.2 Design sketch (after B5 `retained`)

1. Keep **identical** `webPreferences` (sandbox, isolation, no Node).
2. Reuse only when window alive + same display configuration; else recreate.
3. Reset renderer state with synthetic clear before every show; acknowledge generation token.
4. Dismiss / shutdown / crash paths must not leave hidden windows pinning memory.

#### C4.3 Acceptance

- [ ] B5 receipt `retained` (measurement optional; product shipped under all-waves authorization)
- [x] Hide/reuse with identical `SECURE_WEB_PREFERENCES`; DOM clear before re-present
- [x] Dismiss cancels pending browser-open; force-destroy on shutdown; generation guard
- [x] Unit tests updated for reuse semantics (`alert-window.test.ts`)
- [x] No title/URL in traces (unchanged)

**Effort:** L · **Risk:** High · **Blocked by:** B5

---

### Track C5 — Storage / packaging / startup productizations (O2 adjacent, O5)

**Class:** REMEASURE / FUTURE — only with evidence

| Candidate | Gate | Notes |
|-----------|------|-------|
| Async safeStorage migration | B3 `retained` | Must preserve ciphertext on temporary unavailability |
| electron-builder compression / locale prune | B6 baselines + A/B | Never break `merge:windows-latest-yml` or dual-arch Windows |
| Startup reorder (defer updater, etc.) | B4 phase evidence | Must not auto-OAuth; must not delay tray beyond UX budget |

Each candidate gets its **own** mini-plan before code.

**Shipped (docs only):** `docs/performance/packaging-startup-notes.md` — constraints + gates; no builder/product packaging change.

**Effort:** per-candidate M–L · **Risk:** Medium–High

---

### Track C6 — Explicit non-goals that stay archived (P-NEVER product)

These appear in out-of-scope language but must **not** become implementation tracks:

| Item | Why permanent |
|------|----------------|
| Plaintext token/cache fallback in packaged builds | Credential theft surface |
| Disable `safeStorage` | Same |
| Broader URL egress / open arbitrary URLs | Phishing / malware open |
| Weaken sandbox / contextIsolation / PKCE | Electron threat model |
| Unbounded buffers | Memory DoS / hang |
| Default-on perf tracing with user content | Privacy |
| Drive-by dependency upgrades as “perf” | Supply chain / scope creep |
| Recurrence redesign / multi-account EventKit parity claim for Google MVP | Product honesty (Windows Google ≠ EventKit multi-source) |

**Archive action:** Keep in A1 registry with “No FUTURE track” badge.

---

## 3. Dependency graph

```text
A1 registry ───────────────────────────────────────────────► all tracks
A2 security freeze ─────────────────────────┐
A3 correctness freeze ──────────────────────┼─► C1, C3, C4, C5
A4 bounds freeze ───────────────────────────┤
A5 privacy freeze ──────────────────────────┘

B1 Google measure ──► C1 (design may start earlier; code after B1)
B2 Tray measure ────► C3
B3 safeStorage ─────► C5 (async storage)
B4 Startup measure ─► C2, C5 (startup)
B5 Alert measure ───► C4
B6 Build baseline ──► C5 (package)

C2 requires signing infrastructure (external)
C1-d push requires threat model + possibly backend (external)
```

---

## 4. Suggested execution order (when authorized)

| Order | Work | Parallelizable with |
|------:|------|---------------------|
| 1 | A1–A5 permanent registry + CI | — |
| 2 | B6 nightly baselines (cheap) | A* |
| 3 | B1, B2, B3, B4, B5 as CI capacity allows | each other if no shared prod files |
| 4 | C3 if B2 retained | C5 packaging if independent |
| 5 | C4 if B5 retained | — |
| 6 | C2 if B4 shows helper dominance + signing ready | — |
| 7 | C1 design → C1-c MVP | after A* and B1 |

---

## 5. Per-track Definition of Done (shared template)

Every FUTURE/REMEASURE track PR stack must include:

1. **Link** to this plan section + measurement receipt path (if any).
2. **Must / Must NOT** copied into the PR description.
3. **TDD** for behavior changes; workspace Vitest projects only.
4. **Gates:** `validate:node`, `format:check`, `typecheck`, `lint`, `test`, `test:coverage`, `build`.
5. **Platform gates** where relevant: `package:*`, `verify:*`, `merge:windows-latest-yml`.
6. **No** P-NEVER regressions (A1 deny-list green).
7. **Evidence** under `.omo/evidence/gogmeet-<track>/` (gitignored OK; summarize in PR).
8. **User approval** before merge if security-sensitive (C1, C2, C4).

---

## 6. Risk register

| Risk | Tracks | Mitigation |
|------|--------|------------|
| CI cannot sign macOS helper | C2 | Keep compile-on-device fallback; don’t ship half-signed |
| Google API quota / 410 storms | C1 | Backoff; full resync; partial policy |
| Tray menu flicker / stale error | C3 | Signature includes status phase + account |
| Alert focus theft / stale meeting | C4 | Generation token; security prefs freeze tests |
| Measurement variance | B* | Parent CV < 10% rule; else `rejected` |
| Scope creep via “while we’re here” | All | G9; PR checklist |
| Credential leakage in bench | B1 | Env-only token; redaction tests; no log of auth headers |

---

## 7. Traceability matrix (Out of scope → plan section)

| Out-of-scope item | Class | Wave / Track |
|-------------------|-------|--------------|
| O1 Google syncToken / push / durable DB | FUTURE | C1 (+ B1) |
| O2 plaintext fallback / broader egress | P-NEVER | A1, A2 |
| O3 sandbox / isolation / PKCE weaken | P-NEVER | A1, A2 |
| O4 prebuilt Swift helper | FUTURE | B4 → C2 |
| O5 tray / alert / packaging opts w/o evidence | REMEASURE | B2/B5/B6 → C3/C4/C5 |
| G2 unbounded buffers | P-NEVER | A4 |
| G3 plaintext / safeStorage / transient wipe | P-NEVER | A2 |
| G4 degraded automation | P-NEVER | A3 |
| G5 explicit join retained | P-NEVER | A3 |
| G6 coordinator / no stale pub | P-NEVER | A3 |
| G7 IPC / Node / egress | P-NEVER | A2 |
| G8 secret traces | P-NEVER | A5 |
| G9 drive-by upgrades / default tracing | P-NEVER | A5 |
| G10 prebuilt helper constraints | FUTURE | C2 |

---

## 8. Success criteria for this plan document

- [x] Every PR out-of-scope bullet and parent Must-NOT-have item is classified (P-NEVER / FUTURE / REMEASURE).
- [x] Permanent items have enforcement paths (Wave A).
- [x] Deferred product items have measurement gates and phased delivery.
- [x] No track authorizes violating security guardrails.
- [x] User authorized implementation (2026-07-30).
- [x] Permanent guardrails shipped: registry, scan, freeze tests, CI wiring.
- [x] Measurement lab unblocking: live Google shadow client, optional Electron/safeStorage/startup probes, `measurement.yml` CI, lab docs.
- [ ] Deferred product tracks — only after evidence gates (`retained` receipts).

---

## 9. Recommended first authorization slice

If only one slice is approved next:

1. **Wave A (A1–A5)** — cheap, locks in performance-program invariants.  
2. **B2 + B5 on CI** — unblocks the two highest-churn UX optimization candidates (tray, alert).  
3. Defer **C1** and **C2** until product explicitly wants sync or install-time helper policy.

---

## 10. References

- Parent plan: `docs/plans/gogmeet-performance-enhancement.md`
- Coordinator / provenance / bounds: shipped on `enhance-perfs-v2`
- Measurement scripts: `scripts/performance/measure-*.mjs`
- Evidence (local): `.omo/evidence/gogmeet-performance/task-10-…` through `task-15-…`
- AGENTS: `src/main/calendar/`, `src/main/swift/`, `src/main/scheduler/`, `src/preload/`
