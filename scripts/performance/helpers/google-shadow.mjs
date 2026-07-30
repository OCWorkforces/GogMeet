/**
 * Read-only Google Calendar shadow client for measurement.
 * Never logs credentials. Never writes cache or token stores.
 */
import { performance } from "node:perf_hooks";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MAX_PAGES = 10;

/**
 * @param {string} accessToken - never log
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ calendarIds: string[], pageCount: number, eventIds: string[], errorClass: string | null, transferredBytes: number, durationMs: number }>}
 */
export async function shadowListSelectedCalendarsAndEvents(accessToken, opts = {}) {
  const started = performance.now();
  let transferredBytes = 0;
  let pageCount = 0;
  const eventIds = [];
  const calendarIds = [];

  try {
    // calendarList pages
    let pageToken;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${CALENDAR_API}/users/me/calendarList`);
      url.searchParams.set("maxResults", "250");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const { json, bytes } = await boundedJsonGet(url.toString(), accessToken, opts.signal);
      transferredBytes += bytes;
      pageCount += 1;
      const items = Array.isArray(json["items"]) ? json["items"] : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const id = item["id"];
        if (typeof id !== "string") continue;
        if (item["selected"] === true || item["primary"] === true) {
          calendarIds.push(id);
        }
      }
      const next = json["nextPageToken"];
      if (typeof next !== "string" || next.length === 0) break;
      pageToken = next;
    }
    if (calendarIds.length === 0) calendarIds.push("primary");

    const uniqueCalendars = [...new Set(calendarIds)];
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + 2);

    for (const calendarId of uniqueCalendars) {
      let eventPageToken;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
        );
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("timeMin", timeMin.toISOString());
        url.searchParams.set("timeMax", timeMax.toISOString());
        url.searchParams.set("conferenceDataVersion", "1");
        url.searchParams.set("maxResults", "250");
        if (eventPageToken) url.searchParams.set("pageToken", eventPageToken);
        const { json, bytes } = await boundedJsonGet(url.toString(), accessToken, opts.signal);
        transferredBytes += bytes;
        pageCount += 1;
        const items = Array.isArray(json["items"]) ? json["items"] : [];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          if (item["status"] === "cancelled") continue;
          const id = item["id"];
          if (typeof id === "string") eventIds.push(`${calendarId}:${id}`);
        }
        const next = json["nextPageToken"];
        if (typeof next !== "string" || next.length === 0) break;
        eventPageToken = next;
      }
    }

    return {
      calendarIds: uniqueCalendars.map(() => "cal"), // redacted count via length only in compare
      calendarCount: uniqueCalendars.length,
      pageCount,
      eventIds: eventIds.map((_id, i) => `evt-${i}`), // redacted ids — count/order only for equality
      rawEventCount: eventIds.length,
      errorClass: null,
      transferredBytes,
      durationMs: performance.now() - started,
    };
  } catch (err) {
    const errorClass = classifyShadowError(err);
    return {
      calendarIds: [],
      calendarCount: 0,
      pageCount,
      eventIds: [],
      rawEventCount: 0,
      errorClass,
      transferredBytes,
      durationMs: performance.now() - started,
    };
  }
}

/**
 * Equality for paired shadows — uses counts only (no raw calendar/event ids).
 */
export function compareShadowSnapshots(a, b) {
  if (a.errorClass !== b.errorClass) return "error-mismatch";
  if (a.calendarCount !== b.calendarCount) return "calendar-mismatch";
  if (a.pageCount !== b.pageCount) return "page-count-mismatch";
  if (a.rawEventCount !== b.rawEventCount) return "event-mismatch";
  return null;
}

async function boundedJsonGet(url, accessToken, signal) {
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const bodyText = await res.text();
  const bytes = Buffer.byteLength(bodyText, "utf8");
  if (bytes > 8 * 1024 * 1024) {
    throw Object.assign(new Error("payload-too-large"), { errorClass: "payload-too-large" });
  }
  if (!res.ok) {
    const err = new Error(`http-${res.status}`);
    err.status = res.status;
    throw err;
  }
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw Object.assign(new Error("invalid-json"), { errorClass: "protocol" });
  }
  return { json, bytes };
}

function classifyShadowError(err) {
  if (err && typeof err === "object" && "errorClass" in err && typeof err.errorClass === "string") {
    return err.errorClass;
  }
  if (err && typeof err === "object" && "status" in err) {
    const status = err.status;
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate-limit";
    if (typeof status === "number" && status >= 500) return "server";
    return "protocol";
  }
  if (err instanceof Error && /abort/i.test(err.name)) return "abort";
  return "network";
}
