import type { MeetingEvent } from "../entities/meeting-event.js";
import { isMeetingInProgress } from "./meeting-time.js";

/**
 * Prefer the joinable in-progress meeting; otherwise the next future meeting with a URL.
 */
export function pickJoinTarget(
  events: readonly MeetingEvent[],
  nowMs: number = Date.now(),
): MeetingEvent | null {
  const withUrl = events.filter((e) => !e.isAllDay && !!e.meetUrl);
  const inProgress = withUrl
    .filter((e) => isMeetingInProgress(e, nowMs))
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  if (inProgress[0]) return inProgress[0];

  const upcoming = withUrl
    .filter((e) => new Date(e.startDate).getTime() > nowMs)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0] ?? null;
}
