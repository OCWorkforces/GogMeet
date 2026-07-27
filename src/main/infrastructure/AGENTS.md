# infrastructure/

## OVERVIEW

Driven adapters implementing application ports. Selective population in **Wave 3** (Phase A): JsonSettingsStore, ShellMeetingOpener. Calendar providers remain under `src/main/calendar/` in Phase A.

## RULES

- Implements ports from `application/ports/`.
- May use Electron, Node FS, network, Swift (via existing modules).
- Must not be imported by pure `src/domain/`.
