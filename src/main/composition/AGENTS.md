# composition/

## OVERVIEW

Composition root / binder.

| File | Role |
| --- | --- |
| `bind-composition.ts` | `bindComposition()` — rebinds calendar, settings, join defaults |

## RULES

- Pure wiring only: no network/OAuth/eager FS writes beyond lazy factories.
- Call as the **first line** of `initializeApp` (before IPC).
- Free functions keep module-level defaults so the app works even without this call.
