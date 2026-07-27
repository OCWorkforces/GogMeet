# application/

## OVERVIEW

Application layer: **ports** (interfaces) and **use cases**. Populated in **Wave 2**.

## STRUCTURE (target)

```text
application/
├── ports/       # CalendarPort, SettingsStorePort, MeetingOpenerPort, SchedulerPort, ClockPort, EventPublisherPort
└── use-cases/   # JoinMeeting, GetMeetings, Load/UpdateSettings, permission, disconnect
```

## RULES

- Ports are TypeScript interfaces only (no Electron).
- Use cases depend on ports + `src/domain`, not on concrete adapters.
- Free-function facades in `src/main/facades/` become one-line delegates after Wave 2.
