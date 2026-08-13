# GogMeet status index

| Field | Value |
| --- | --- |
| **App version** | See root `package.json` (source of truth) |
| **Branch context** | `develop` / `main` |
| **Last status refresh** | 2026-08-13 |

This file tells agents and humans what is **shipped**, what is **historical**, and what remains **open**. Prefer root + nested `AGENTS.md` for architecture maps.

## Shipped (do not re-implement)

- Join-by-id hub, mark-opened / cancel pending auto-open on manual join
- Shared meeting URL allowlist (domain + preload + egress)
- Late-join grace, quiet hours (alerts/notifications only; auto-open continues by design)
- Settings schema **v3** full timing UI
- Google OAuth PKCE + incremental sync (ADR 0002) + offline complete-only cache
- Darwin occurrence-aware EventKit UIDs + dual-source Swift package/hash
- Darwin partial refresh diagnostics (tray-only rows)
- Auto-updater + native update dialog (packaged non-portable)
- Permanent guardrails scan + freeze tests
- Performance measurement lab (evidence-only; no product opts from `retained` alone)

## Historical docs (do not treat as current bugs)

| Doc | Note |
| --- | --- |
| `docs/enhancement-development-plan.md` | Written against **1.16.0**; many Sprint A–C items are shipped. Treat as archive + residual backlog only. |
| `docs/clean-architecture-refactor-plan.md` | Phase A largely landed; Phase B (instance AppGraph, adapter relocation) is optional follow-up. |
| `docs/windows-platform-support-design.md` | Google MVP shipped; Graph/Outlook Phase 2 remains open product work. |

## Open backlog (ranked themes)

1. **Reliability:** power-path thrash (improved), partial automation policy, HTML/host extract gaps (improved)
2. **Windows depth:** Microsoft Graph / Outlook; calendar multi-select + human names
3. **Hosts:** Teams/Webex allowlist (landed in domain extract; dogfood edge wrappers remain)
4. **macOS cold start:** ship prebuilt signed Swift helper (code prefers bundled helper; packaging still sources-first)
5. **Architecture Phase B:** instance-owned AppGraph, capability-based providers, single refresh session API
6. **CI:** PR unsigned package layout smoke; vertical main↔preload↔renderer smokes

## Commands for day-one orientation

```bash
bun install
bun run test
bun run typecheck
bun run guardrails
```

Read: root `AGENTS.md`, then `src/main/AGENTS.md` / `src/main/swift/AGENTS.md` for Darwin calendar.
