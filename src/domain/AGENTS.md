# domain/ (pure)

## OVERVIEW

**Pure** domain layer (Clean Architecture). Zero Electron, `node:fs`, network, or Swift process dependencies.

## STRUCTURE

```text
src/domain/
├── entities/    # brands, MeetingEvent, CalendarResult, settings types, Result, errors…
├── policies/    # meet URL allowlist
└── services/    # buildMeetUrl, validateMeetUrl, url-extract, cleanDescription,
                 # pickJoinTarget, event-signature, time, settings-parse, platform
```

## RULES

- Import only other `src/domain/**` modules.
- Callers: `src/shared` (IPC maps), main/preload/renderer, tests.
- **No** re-export barrels from old `shared/*` or `main/utils` paths.
- Opening meeting URLs (`shell.openExternal`) stays in `main/utils/meet-url.ts`.

## WHERE TO LOOK

| Concern | Path |
| --- | --- |
| Brands / validators | `entities/brand.ts` |
| Settings schema + quiet hours | `entities/settings.ts` |
| Settings parse/clamp | `services/settings-parse.ts` |
| Allowlist + validateMeetUrl | `policies/meet-url-allowlist.ts`, `services/url-validation.ts` |
| buildMeetUrl (pure) | `services/build-meet-url.ts` |
| URL extract / clean notes | `services/url-extract.ts`, `services/clean-description.ts` |
