# composition/

## OVERVIEW

Composition root / binder. **Wave 2 PR-2.5:** `bindPhaseA()`. **Phase B Wave 5:** full `createAppGraph`.

## RULES

- Pure wiring only: construct adapters + use cases; no network/OAuth/eager FS writes beyond lazy factories.
- Called first from `initializeApp` (before IPC) once binders land.
- No dual algorithm bodies — bind the single use-case implementation.
