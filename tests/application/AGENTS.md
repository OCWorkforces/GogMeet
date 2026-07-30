# Application Test Suite

## OVERVIEW

Vitest project `application`: Node, no Electron mocks. Covers `src/main/application/use-cases/**` with port fakes.

## FILES

| Suite | Covers |
| --- | --- |
| `join-meeting.test.ts` | JoinMeeting use case (opener + scheduler ports; any ok provenance) |
| `get-meetings.test.ts` | GetMeetings: ready / limited / offline-cached / error UI mapping |
| `disconnect-calendar.test.ts` | Disconnect + cache clear hooks |

## RULES

- Inject fake ports; do not import Electron or real facades.
- Prefer pure arrangement/assert over module-level binds.
- New use cases get a suite here before wiring into facades/graph.
