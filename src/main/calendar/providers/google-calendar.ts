/**
 * Google Calendar API provider (Windows MVP).
 * Maps API responses directly to MeetingEvent[] — no JSON Lines.
 */

import type { CalendarPermission, CalendarResult } from "../../../shared/calendar-result.js";
import type { MeetingEvent } from "../../../shared/meeting-event.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../../shared/brand.js";
import { formatAppError } from "../../../shared/errors.js";
import { isObjectRecord } from "../../../shared/type-guards.js";
import { cleanDescription } from "../clean-description.js";
import { extractMeetingUrl } from "../url-extract.js";
import type { CalendarProvider } from "../provider.js";
import { clearGoogleTokens, loadGoogleTokens } from "../auth/google-token-store.js";
import {
  ensureFreshGoogleAccessToken,
  isGoogleOAuthInFlight,
  runGooglePkceLogin,
} from "../auth/google-oauth.js";
import { isGoogleOAuthConfigured } from "../auth/google-client-id.js";
import { clearOfflineCache, loadOfflineCache, saveOfflineCache } from "../offline-cache.js";

const MAX_PAGES = 50;

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

function dayBoundsLocal(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

async function googleFetch(
  url: string,
  accessToken: string,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; body: string }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body };
  }
  try {
    return { ok: true, json: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, status: res.status, body: "invalid JSON" };
  }
}

async function listSelectedCalendarIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const result = await googleFetch(url.toString(), accessToken);
    if (!result.ok) {
      if (result.status === 401) throw new AuthError(result.body);
      throw new NetworkError(`calendarList failed (${result.status})`);
    }
    if (!isObjectRecord(result.json) || !Array.isArray(result.json["items"])) break;

    for (const item of result.json["items"]) {
      if (!isObjectRecord(item)) continue;
      const id = item["id"];
      if (typeof id !== "string") continue;
      if (item["selected"] === true || item["primary"] === true) {
        ids.push(id);
      }
    }

    const next = result.json["nextPageToken"];
    if (typeof next !== "string" || next.length === 0) break;
    pageToken = next;
  }

  if (ids.length === 0) {
    ids.push("primary");
  }
  return [...new Set(ids)];
}

function mapGoogleEvent(
  raw: unknown,
  calendarId: string,
  calendarName: string,
  userEmail: string | undefined,
): MeetingEvent | null {
  if (!isObjectRecord(raw)) return null;
  if (raw["status"] === "cancelled") return null;

  const attendees = raw["attendees"];
  if (Array.isArray(attendees)) {
    for (const a of attendees) {
      if (isObjectRecord(a) && a["self"] === true && a["responseStatus"] === "declined") {
        return null;
      }
    }
  }

  const idRaw = raw["id"];
  if (typeof idRaw !== "string") return null;
  const title = typeof raw["summary"] === "string" ? raw["summary"] : "(No title)";

  const startObj = isObjectRecord(raw["start"]) ? raw["start"] : null;
  const endObj = isObjectRecord(raw["end"]) ? raw["end"] : null;
  if (!startObj || !endObj) return null;

  let isAllDay = false;
  let startIso: string;
  let endIso: string;

  if (typeof startObj["dateTime"] === "string" && typeof endObj["dateTime"] === "string") {
    startIso = new Date(startObj["dateTime"]).toISOString();
    endIso = new Date(endObj["dateTime"]).toISOString();
  } else if (typeof startObj["date"] === "string" && typeof endObj["date"] === "string") {
    isAllDay = true;
    startIso = new Date(`${startObj["date"]}T00:00:00.000Z`).toISOString();
    endIso = new Date(`${endObj["date"]}T00:00:00.000Z`).toISOString();
  } else {
    return null;
  }

  const startBrand = asIsoUtc(startIso);
  const endBrand = asIsoUtc(endIso);
  const idBrand = asEventId(`${calendarId}:${idRaw}`);
  if (!startBrand.ok || !endBrand.ok || !idBrand.ok) return null;

  const hangout = typeof raw["hangoutLink"] === "string" ? raw["hangoutLink"] : undefined;
  const location = typeof raw["location"] === "string" ? raw["location"] : undefined;
  const descriptionRaw = typeof raw["description"] === "string" ? raw["description"] : undefined;
  const description = descriptionRaw !== undefined ? cleanDescription(descriptionRaw) : undefined;

  const entryPoints: string[] = [];
  const conf = raw["conferenceData"];
  if (isObjectRecord(conf) && Array.isArray(conf["entryPoints"])) {
    for (const ep of conf["entryPoints"]) {
      if (isObjectRecord(ep) && typeof ep["uri"] === "string") {
        entryPoints.push(ep["uri"]);
      }
    }
  }

  const extracted = extractMeetingUrl(hangout, ...entryPoints, location, description);
  let meetUrl: MeetingEvent["meetUrl"];
  if (extracted !== undefined) {
    const branded = asMeetUrl(extracted);
    if (branded.ok) meetUrl = branded.value;
  }

  return {
    id: idBrand.value,
    title,
    startDate: startBrand.value,
    endDate: endBrand.value,
    calendarName,
    isAllDay,
    ...(meetUrl !== undefined ? { meetUrl } : {}),
    ...(userEmail !== undefined ? { userEmail } : {}),
    ...(description !== undefined && description.length > 0 ? { description } : {}),
  };
}

async function fetchEventsForCalendar(
  accessToken: string,
  calendarId: string,
  calendarName: string,
  userEmail: string | undefined,
  timeMin: string,
  timeMax: string,
): Promise<MeetingEvent[]> {
  const events: MeetingEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("conferenceDataVersion", "1");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const result = await googleFetch(url.toString(), accessToken);
    if (!result.ok) {
      if (result.status === 401) throw new AuthError(result.body);
      if (result.status === 403 || result.status === 404) {
        console.warn(`[calendar:google] Skipping calendar ${calendarId}: HTTP ${result.status}`);
        return events;
      }
      throw new NetworkError(`events.list failed (${result.status})`);
    }

    if (!isObjectRecord(result.json) || !Array.isArray(result.json["items"])) break;

    for (const item of result.json["items"]) {
      const mapped = mapGoogleEvent(item, calendarId, calendarName, userEmail);
      if (mapped) events.push(mapped);
    }

    const next = result.json["nextPageToken"];
    if (typeof next !== "string" || next.length === 0) break;
    pageToken = next;
  }

  return events;
}

async function fetchAllEvents(
  accessToken: string,
  userEmail: string | undefined,
): Promise<MeetingEvent[]> {
  const { timeMin, timeMax } = dayBoundsLocal();
  const calendarIds = await listSelectedCalendarIds(accessToken);
  const merged: MeetingEvent[] = [];
  let successCount = 0;
  let lastError: Error | null = null;

  for (const calendarId of calendarIds) {
    try {
      const batch = await fetchEventsForCalendar(
        accessToken,
        calendarId,
        calendarId,
        userEmail,
        timeMin,
        timeMax,
      );
      merged.push(...batch);
      successCount++;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[calendar:google] Calendar ${calendarId} failed:`, lastError.message);
    }
  }

  if (successCount === 0 && lastError) {
    throw lastError;
  }

  merged.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return merged;
}

/**
 * Create the Google Calendar provider used on Windows (and non-Darwin auto).
 */
export function createGoogleCalendarProvider(): CalendarProvider {
  return {
    id: "google-calendar",

    async getEvents(): Promise<CalendarResult> {
      try {
        let tokens = await ensureFreshGoogleAccessToken();
        if (tokens === null) {
          return {
            kind: "err",
            error: formatAppError({
              kind: "calendar-permission-denied",
              message: "Connect Google Calendar from the tray menu or Settings.",
            }),
          };
        }

        try {
          const events = await fetchAllEvents(tokens.accessToken, tokens.email);
          await saveOfflineCache(events);
          return { kind: "ok", events };
        } catch (err) {
          if (err instanceof AuthError) {
            // One refresh+retry
            tokens = await ensureFreshGoogleAccessToken();
            if (tokens === null) {
              await clearGoogleTokens();
              return {
                kind: "err",
                error: formatAppError({
                  kind: "calendar-auth",
                  message: "Google session expired. Please reconnect.",
                }),
              };
            }
            try {
              const events = await fetchAllEvents(tokens.accessToken, tokens.email);
              await saveOfflineCache(events);
              return { kind: "ok", events };
            } catch (retryErr) {
              if (retryErr instanceof AuthError) {
                await clearGoogleTokens();
                return {
                  kind: "err",
                  error: formatAppError({
                    kind: "calendar-auth",
                    message: "Google session expired. Please reconnect.",
                  }),
                };
              }
              throw retryErr;
            }
          }

          // Network / other: try offline cache
          const cache = await loadOfflineCache();
          if (cache && cache.events.length > 0) {
            console.warn("[calendar:google] Network failure; using offline cache");
            return { kind: "ok", events: cache.events };
          }

          const message = err instanceof Error ? err.message : String(err);
          return {
            kind: "err",
            error: formatAppError({
              kind: "calendar-network",
              message: message || "Can't reach Google Calendar",
            }),
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[calendar:google] getEvents error:", err);
        return {
          kind: "err",
          error: formatAppError({
            kind: "calendar-runtime",
            message,
          }),
        };
      }
    },

    async getPermissionStatus(): Promise<CalendarPermission> {
      if (isGoogleOAuthInFlight()) return "not-determined";
      if (!isGoogleOAuthConfigured()) return "denied";
      const tokens = await loadGoogleTokens();
      return tokens !== null ? "granted" : "not-determined";
    },

    async requestPermission(): Promise<CalendarPermission> {
      if (!isGoogleOAuthConfigured()) {
        console.error("[calendar:google] GOOGLE_OAUTH_CLIENT_ID is not configured");
        return "denied";
      }
      const result = await runGooglePkceLogin();
      if (result === "granted") return "granted";
      if (result === "denied") return "denied";
      return "not-determined";
    },

    async disconnect(): Promise<void> {
      await clearGoogleTokens();
      await clearOfflineCache();
    },

    async warmup(): Promise<void> {
      // Soft-refresh tokens if present; ignore failures
      await ensureFreshGoogleAccessToken().catch(() => null);
    },
  };
}
