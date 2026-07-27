import type { EventId } from "../../domain/entities/brand.js";
import type { Result } from "../../domain/entities/result.js";
import { createJoinMeeting, type JoinMeeting } from "../application/use-cases/join-meeting.js";
import { getCalendarEventsResult } from "../facades/calendar.js";
import { cancelPendingBrowserOpen, getLastKnownEvents } from "../scheduler/facade.js";
import { openMeetingUrl } from "./meet-url.js";

function createDefaultJoinMeeting(): JoinMeeting {
  return createJoinMeeting({
    getLastKnownEvents: () => getLastKnownEvents(),
    fetchCalendarEvents: () => getCalendarEventsResult(),
    opener: { open: (url) => openMeetingUrl(url) },
    cancelPendingBrowserOpen: (id) => {
      cancelPendingBrowserOpen(id);
    },
  });
}

let _impl: JoinMeeting = createDefaultJoinMeeting();

/** Test / composition override — default is already production-safe. */
export function bindJoinMeeting(impl: JoinMeeting): void {
  _impl = impl;
}

export function rebindJoinMeetingDefaults(): void {
  _impl = createDefaultJoinMeeting();
}

/**
 * Resolve a meeting by EventId, open it with identity params, and suppress
 * pending auto-open for that event. All menu / hotkey / IPC join paths use this.
 */
export async function joinMeetingById(id: EventId): Promise<Result<void, string>> {
  return _impl.execute(id);
}
