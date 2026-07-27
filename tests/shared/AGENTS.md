# Shared Test Suite

## OVERVIEW

Vitest project `shared`: Node environment, **no Electron mocks**, no jsdom. Intended for residual `src/shared/**` contract tests.

Most pure logic that used to live under shared (brands, errors, pick-join-target, parse-json, event-signature, url validation) now lives in **`src/domain/`** with suites under **`tests/domain/`**.

## CURRENT STATE

`tests/shared/` may contain few or no `*.test.ts` files after the domain extract. The Vitest project remains registered with `passWithNoTests: true`.

When adding tests:

| Concern | Prefer |
| --- | --- |
| Brands, Result, AppError, settings, MeetingEvent | `tests/domain/` |
| IPC channel constants / maps | often covered in `tests/main/ipc-channels.test.ts` |
| Thin shared DTOs only | `tests/shared/` |

## RULES

- Do not import Electron or arbitrary main-process modules.
- Do not load `tests/setup.main.ts`.
- Keep tests deterministic.
