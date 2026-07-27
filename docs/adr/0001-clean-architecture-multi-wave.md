# ADR 0001: Clean Architecture multi-wave refactor

| Field | Value |
| --- | --- |
| Status | Accepted |
| Date | 2026-07-27 |
| Deciders | engineering |
| Related | `docs/clean-architecture-refactor-plan.md` |

## Context

GogMeet (~10k LOC Electron) has partial seams (`CalendarProvider`, facades, typed IPC) but impure “domain” modules, singleton free functions, and scheduler/Electron mixing. We need clearer dependency rules without a big-bang rewrite.

## Decision

Adopt a **hybrid Clean Architecture** mapped to Electron multi-process:

1. Process shells stay: `main` / `preload` / `renderer`.
2. Pure core: `src/domain/` (Wave 1+).
3. Impure former `src/main/domain/` renamed to **`src/main/facades/`** (Wave 0) before pure domain lands.
4. Phase A (default): Waves 0–2 + selective Wave 3 — ports, use cases, selective adapters.
5. Phase B (optional): scheduler SchedulePlan, full composition root, cleanup.
6. **No permanent re-export / deprecated shims** (K27); temporary re-exports deleted same-wave.
7. Manual composition root; no DI container.
8. `eslint-plugin-boundaries` is the CI gate; sentrux is secondary/local.

## Consequences

- Agents and humans must treat `facades/` as the main application surface until use cases absorb call sites.
- Pure `src/domain/` must never import Electron/FS/Swift.
- Feature work continues via existing facades until Wave 6 retires free functions if AppGraph owns them.

## Alternatives considered

- Full textbook folder rewrite across processes — rejected (Electron bundles).
- DI container — rejected (scale + TypeScript ergonomics).
- “Pure into shared only” without ports — insufficient for join/settings testability.
