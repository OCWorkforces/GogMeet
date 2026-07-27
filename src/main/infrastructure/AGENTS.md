# infrastructure/

## OVERVIEW

Driven adapters implementing application ports. Planned adapters: JsonSettingsStore, ShellMeetingOpener. Calendar providers currently remain under `src/main/calendar/`.

## RULES

- Implements ports from `application/ports/`.
- May use Electron, Node FS, network, Swift (via existing modules).
- Must not be imported by pure `src/domain/`.
