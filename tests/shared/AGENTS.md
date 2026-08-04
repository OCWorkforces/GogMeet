# Shared Test Suite

## OVERVIEW

Vitest project `shared`: Node environment, **no Electron mocks**, no jsdom. Covers residual `src/shared/**` contracts and pure helpers that are not domain entities.

Most pure logic that used to live under shared (brands, errors, pick-join-target, parse-json, event-signature, url validation) now lives in **`src/domain/`** with suites under **`tests/domain/`**.

## CURRENT SUITES

| Suite | Covers |
| --- | --- |
| `as.test.ts` | `Object.prototype.As` + free-function `As` cast helper (`sideEffects` package entry) |
| `contracts.test.ts` | IPC channel uniqueness + a few key names (deep map coverage lives in `tests/main/ipc-channels.test.ts`) |
| `app-icon-aurora.test.ts` | Brand aurora CSS/HTML helper (palette, reduced-motion CSS, attr escape, alt/aria) |

Setup: `tests/setup.as.ts` installs the cast extension for this project. Coverage floors: **90 / 90 / 80 / 80**; type-only modules `alert.ts` / `app-state.ts` excluded. (`AppState` is also exercised from `tests/main/app-state.test.ts` under the main project.)

When adding tests:

| Concern | Prefer |
| --- | --- |
| Brands, Result, AppError, settings (v3), MeetingEvent, CalendarResult, CalendarPublication | `tests/domain/` |
| IPC channel constants / maps | often covered in `tests/main/ipc-channels.test.ts` |
| Thin shared DTOs / cast helper / app-icon aurora strings | `tests/shared/` |

## RULES

- Do not import Electron or arbitrary main-process modules.
- Do not load `tests/setup.main.ts` (Electron mock).
- Keep tests deterministic.
