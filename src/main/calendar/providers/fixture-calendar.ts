/**
 * Dev/test fixture calendar provider.
 *
 * Enabled only when unpackaged AND GOGMEET_CALENDAR_FIXTURE points at a JSON file
 * (factory gate — K23). Never used in packaged builds.
 *
 * File format: either a JSON array of meeting-like objects, or
 * `{ "events": [ ... ] }`. Required fields per event: id, title, startDate,
 * endDate, calendarName, isAllDay. Optional: meetUrl, userEmail, description.
 */

import { readFile } from "node:fs/promises";

import type { CalendarPermission, CalendarResult } from "../../../shared/calendar-result.js";
import type { MeetingEvent } from "../../../shared/meeting-event.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../../shared/brand.js";
import { isObjectRecord } from "../../../shared/type-guards.js";
import { formatAppError } from "../../../shared/errors.js";
import type { CalendarProvider } from "../provider.js";

function mapFixtureEvent(raw: unknown, index: number): MeetingEvent | null {
  if (!isObjectRecord(raw)) return null;

  const idRaw = raw["id"];
  const titleRaw = raw["title"];
  const startRaw = raw["startDate"];
  const endRaw = raw["endDate"];
  const calendarRaw = raw["calendarName"];
  const allDayRaw = raw["isAllDay"];

  if (typeof idRaw !== "string" || typeof titleRaw !== "string") return null;
  if (typeof startRaw !== "string" || typeof endRaw !== "string") return null;
  if (typeof calendarRaw !== "string") return null;
  if (typeof allDayRaw !== "boolean") return null;

  const id = asEventId(idRaw);
  const start = asIsoUtc(startRaw);
  const end = asIsoUtc(endRaw);
  if (!id.ok || !start.ok || !end.ok) {
    console.warn(`[calendar:fixture] Skipping event[${index}]: invalid brand fields`);
    return null;
  }

  const event: MeetingEvent = {
    id: id.value,
    title: titleRaw,
    startDate: start.value,
    endDate: end.value,
    calendarName: calendarRaw,
    isAllDay: allDayRaw,
  };

  const meetUrlRaw = raw["meetUrl"];
  if (typeof meetUrlRaw === "string" && meetUrlRaw.length > 0) {
    const branded = asMeetUrl(
      /^https?:\/\//i.test(meetUrlRaw) ? meetUrlRaw : `https://${meetUrlRaw}`,
    );
    if (branded.ok) {
      event.meetUrl = branded.value;
    }
  }

  const emailRaw = raw["userEmail"];
  if (typeof emailRaw === "string" && emailRaw.trim().length > 0) {
    event.userEmail = emailRaw.trim();
  }

  const descRaw = raw["description"];
  if (typeof descRaw === "string" && descRaw.length > 0) {
    event.description = descRaw;
  }

  return event;
}

function parseFixturePayload(raw: string): MeetingEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Fixture file is not valid JSON");
  }

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (isObjectRecord(parsed) && Array.isArray(parsed["events"])) {
    list = parsed["events"];
  } else {
    throw new Error('Fixture JSON must be an array or { "events": [...] }');
  }

  const events: MeetingEvent[] = [];
  for (let i = 0; i < list.length; i++) {
    const mapped = mapFixtureEvent(list[i], i);
    if (mapped !== null) events.push(mapped);
  }
  return events;
}

/**
 * Create a fixture provider that loads events from `filePath` on each fetch.
 */
export function createFixtureCalendarProvider(filePath: string): CalendarProvider {
  return {
    id: "fixture",

    async getEvents(): Promise<CalendarResult> {
      try {
        const raw = await readFile(filePath, "utf-8");
        const events = parseFixturePayload(raw);
        return { kind: "ok", events };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[calendar:fixture] getEvents failed:", message);
        return {
          kind: "err",
          error: formatAppError({
            kind: "calendar-runtime",
            message: `Fixture calendar failed: ${message}`,
          }),
          code: "runtime",
        };
      }
    },

    async getPermissionStatus(): Promise<CalendarPermission> {
      return "granted";
    },

    async requestPermission(): Promise<CalendarPermission> {
      return "granted";
    },
  };
}
