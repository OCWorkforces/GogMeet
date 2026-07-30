# ADR 0002: Google Calendar incremental sync (nextSyncToken)

## Status

Accepted (MVP)

## Context

Full-window `events.list` polls are correct but expensive. The performance program deferred incremental sync until measurement and design gates existed. We now store **opaque** `nextSyncToken` values per calendar (encrypted) and maintain a **process-local** event index — not a durable event database.

## Decision

1. After a successful full time-window list, persist Google's `nextSyncToken` when present.
2. On later polls, if a token and in-memory index exist, call `events.list?syncToken=…`.
3. On HTTP **410 Gone**, delete that calendar's token, clear the index, and full-window fetch.
4. Disconnect clears tokens + index.
5. Cache writes remain **live complete only**; automation eligibility unchanged.
6. Push/webhooks remain out of scope.

## Consequences

- First launch / cold process always full-window fetches (empty index).
- Incremental merges require the process to have completed at least one full fetch.
- Token file: `{userData}/calendar-auth/google-sync.enc` (encrypted when available).
