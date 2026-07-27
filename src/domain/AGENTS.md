# domain/ (pure)

## OVERVIEW

**Pure** domain layer (Clean Architecture). Zero Electron, `node:fs`, network, or Swift process dependencies.

Populated in **Wave 1** of `docs/clean-architecture-refactor-plan.md` (entities, allowlist, buildMeetUrl, join-target, quiet hours, settings parse, etc.).

## STRUCTURE (target)

```text
src/domain/
├── entities/    # brands, MeetingEvent, CalendarResult, settings types…
├── policies/    # allowlist, quiet-hours
└── services/    # buildMeetUrl, pickJoinTarget, settings-parse, url-extract, cleanDescription
```

## RULES

- May import only other `src/domain/**` modules (and no process code).
- Callers: `src/shared` (IPC maps import types), `src/main/application`, facades, infrastructure, preload/renderer.
- **No** re-export barrels for “compat” after Wave 1 PR-1.4.
