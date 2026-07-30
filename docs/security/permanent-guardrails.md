# Permanent security & correctness guardrails

**Status:** Active (Wave A of `docs/plans/gogmeet-out-of-scope-follow-on.md`)  
**Updated:** 2026-07-30  
**Enforcement:** `bun run guardrails` → `scripts/guardrails-scan.mjs` + freeze tests in CI

These invariants were **out of scope** for the performance program as *permanent non-goals* (P-NEVER). They must not ship in product code. Future product tracks (Google sync, prebuilt Swift helper, tray/alert optimizations) live in the follow-on plan and must not weaken anything here.

## Registry

| ID | Invariant | Owning code | Automated check | Escalation |
| --- | --- | --- | --- | --- |
| O2 / G3 | No plaintext token/cache fallback when packaged; no disable `safeStorage` | `calendar/auth/google-token-store.ts`, `calendar/offline-cache.ts` | `tests/main/google-token-store.test.ts`, `offline-cache.test.ts`, `guardrails-security.test.ts` | Security review |
| O2 / G7 | Meeting URL egress only via allowlisted opener / join hub | `shell-meeting-opener.ts`, `join-meeting.ts`, meet-url allowlist | `join-meeting` tests + scan (allowlisted `openExternal` files only) | Security review |
| O3 / G7 | All BrowserWindows: sandbox + contextIsolation + no Node | `utils/browser-window.ts` `SECURE_WEB_PREFERENCES` | `browser-window.test.ts`, `guardrails-security.test.ts`, scan | Security review |
| O3 | PKCE + state required for Google OAuth | `calendar/auth/google-oauth.ts` | `google-oauth.test.ts` | Security review |
| G2 | Bounded Swift helper + Google HTTP ceilings | `swift-helper-process.ts`, `google-http.ts` | constant equality tests + scan (no `maxBuffer` product paths) | Design note if bounds change |
| G4 | No automation from partial/offline | `isCalendarAutomationEligible`, `suspend-automation`, poll | `calendar-result` + `scheduler-poll` tests | Calendar owner |
| G5 | Explicit join retained on degraded data | join hub + shortcuts | `join-meeting`, `shortcuts` tests | Calendar owner |
| G6 | Single-flight coordinator; no force-poll IPC shim | `refresh-coordinator.ts`, IPC maps | coordinator tests + scan for deleted channels | Main owner |
| G7 | Typed IPC + sender validation; no raw handle/send | `ipc-handlers/*` | scan + existing IPC tests | Main owner |
| G8 | No secrets/user content in perf traces | `performance-trace.ts`, report scripts | `performance-trace` + `performance-report` tests | Privacy |
| G9 | Trace opt-in only; bench outside default CI | `GOGMEET_PERF_TRACE`, `vitest.bench.config.ts` | scan + workspace config | Perf owner |
| G1 | No `syncToken` / push / durable event DB **until** FUTURE track C1 | Google provider / auth | scan deny-list | Product + design ADR |
| G10 / O4 | No prebuilt Swift helper **until** track C2 | `swift/*` packaging | scan for prebuilt helper claims / paths | Release owner |
| O5 | No tray/alert/package “opts” without evidence | tray, alert-window, builder | process: REMEASURE receipts only | Perf owner |

## Class legend

| Class | Meaning |
| --- | --- |
| **P-NEVER** | Never implement; CI blocks regressions |
| **FUTURE** | Separate design + gates (see follow-on plan Wave C) |
| **REMEASURE** | Measurement must return `retained` first |

## Allowlisted `shell.openExternal` call sites

Only these main-process files may call `shell.openExternal` (scan-enforced):

| File | Purpose |
| --- | --- |
| `src/main/infrastructure/electron/shell-meeting-opener.ts` | Allowlisted meeting join URLs |
| `src/main/calendar/auth/google-oauth.ts` | System browser OAuth authorize URL |
| `src/main/utils/system-settings.ts` | macOS System Settings deep links |
| `src/main/system/notification.ts` | Notification click → settings/privacy panes |
| `src/main/windows/about-window.ts` | About dialog homepage / license links |

New call sites require a registry update + security review.

## New meeting hosts

Updating supported join hosts requires **all** of:

1. `src/domain/policies/meet-url-allowlist.ts`
2. Swift extraction (`googlemeet-events.swift`) when applicable
3. Domain/url tests
4. This registry note (who approved)

## Resource bounds (change policy)

| Bound | Constant | Value |
| --- | --- | --- |
| Swift stdout | `SWIFT_HELPER_STDOUT_LIMIT_BYTES` | 8 MiB |
| Swift stderr | `SWIFT_HELPER_STDERR_LIMIT_BYTES` | 256 KiB |
| Swift timeout | `SWIFT_HELPER_TIMEOUT_MS` | 15 s |
| Google request | `GOOGLE_HTTP_REQUEST_TIMEOUT_MS` | 15 s |
| Google body | `GOOGLE_HTTP_BODY_LIMIT_BYTES` | 8 MiB |
| Google poll budget | `GOOGLE_POLL_BUDGET_MS` | 60 s |

Changing a bound requires: design note in the PR, updated limit±1 tests, and review. Silent inflation is forbidden.

## IPC channels never to reintroduce

| Channel | Status |
| --- | --- |
| `scheduler:force-poll` / `SCHEDULER_FORCE_POLL` | **Deleted** — refresh is `CALENDAR_GET_EVENTS` + coordinator |
| `calendar:events-updated` / `CALENDAR_EVENTS_UPDATED` | **Renamed** to `CALENDAR_RESULT_UPDATED` (publication envelope) |

## Commands

```bash
bun run guardrails          # static deny-list scan
bun run guardrails:tests    # freeze test suite
```

CI runs both on every PR (`pr-check.yml`).

## Related docs

- Follow-on plan: `docs/plans/gogmeet-out-of-scope-follow-on.md`
- Performance plan: `docs/plans/gogmeet-performance-enhancement.md`
- Root agents: `AGENTS.md`
