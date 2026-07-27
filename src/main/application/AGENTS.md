# application/

## OVERVIEW

Application layer: **ports** (interfaces) and **use cases**.

## STRUCTURE

```text
application/
├── ports/       # CalendarPort, SettingsStorePort, MeetingOpenerPort, SchedulerPort, ClockPort, EventPublisherPort
└── use-cases/   # JoinMeeting, GetMeetings, settings, permission, disconnect
```

## RULES

- Ports are TypeScript interfaces only (no Electron).
- Use cases depend on ports + `src/domain`, not concrete adapters.
- Free-function facades in `src/main/facades/` and `utils/join-meeting.ts` are one-line delegates with module-level default bind.
- Production defaults are production-safe without lifecycle bind; `composition/bind-composition.ts` formalizes wiring.
