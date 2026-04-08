/** Check if a date is tomorrow (local time) */
export function isTomorrow(isoDate: string): boolean {
  const date = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  return date >= tomorrow && date < dayAfter;
}

/** Format ISO date string to locale time like "10:00 AM" */
export function formatMeetingTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Format minutes remaining as "Xh Ym" or "Xm" for in-meeting display */
export function formatRemainingTime(totalMins: number): string {
  if (totalMins <= 0) return "0m";
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}
