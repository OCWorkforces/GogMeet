/**
 * Google Calendar API provider (Windows MVP).
 * Maps API responses directly to MeetingEvent[] — no JSON Lines.
 */

import type {
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";
import {
  calendarErr,
  calendarLiveOk,
  calendarOfflineOk,
} from "../../../domain/entities/calendar-result.js";
import type { MeetingEvent } from "../../../domain/entities/meeting-event.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../../domain/entities/brand.js";
import { formatAppError } from "../../../domain/entities/errors.js";
import { isObjectRecord } from "../../../domain/entities/type-guards.js";
import { cleanDescription } from "../../../domain/services/clean-description.js";
import { extractMeetingUrl } from "../../../domain/services/url-extract.js";
import type { CalendarProvider } from "../provider.js";
import { clearGoogleTokens, loadGoogleTokens } from "../auth/google-token-store.js";
import {
  ensureFreshGoogleAccessToken,
  isGoogleOAuthInFlight,
  refreshGoogleAccessToken,
  runGooglePkceLogin,
} from "../auth/google-oauth.js";
import { isGoogleOAuthConfigured } from "../auth/google-client-id.js";
import { clearOfflineCache, loadOfflineCache, saveOfflineCache } from "../offline-cache.js";
import {
  createPollBudgetSignal,
  GOOGLE_POLL_BUDGET_MS,
  GoogleHttpError,
  googleHttpRequest,
} from "../google-http.js";

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
  signal?: AbortSignal,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; body: string }> {
  try {
    const res = await googleHttpRequest({
      url,
      headers: { Authorization: `Bearer ${accessToken}` },
      ...(signal !== undefined ? { signal } : {}),
    });
    if (!res.ok) {
      // Do not propagate raw bodies upward for logging — keep a short redacted stub.
      return { ok: false, status: res.status, body: `http ${res.status}` };
    }
    try {
      return { ok: true, json: JSON.parse(res.bodyText) as unknown };
    } catch {
      return { ok: false, status: res.status, body: "invalid JSON" };
    }
  } catch (err) {
    if (err instanceof GoogleHttpError) {
      if (err.errorClass === "auth") {
        throw new AuthError(err.message);
      }
      throw new NetworkError(err.message);
    }
    throw err;
  }
}

async function listSelectedCalendarIds(
  accessToken: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const result = await googleFetch(url.toString(), accessToken, signal);
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
  signal?: AbortSignal,
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

    const result = await googleFetch(url.toString(), accessToken, signal);
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
  signal?: AbortSignal,
): Promise<{ events: MeetingEvent[]; completeness: "complete" | "partial" }> {
  const { timeMin, timeMax } = dayBoundsLocal();
  const calendarIds = await listSelectedCalendarIds(accessToken, signal);
  const merged: MeetingEvent[] = [];
  let successCount = 0;
  let failedCount = 0;
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
        signal,
      );
      merged.push(...batch);
      successCount++;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      failedCount++;
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[calendar:google] Calendar ${calendarId} failed:`, lastError.message);
    }
  }

  if (successCount === 0 && lastError) {
    throw lastError;
  }

  merged.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  // All selected calendars fully traversed → complete (even with zero events).
  // At least one complete + any failed → partial.
  const completeness: "complete" | "partial" =
    failedCount === 0 && successCount === calendarIds.length ? "complete" : "partial";
  return { events: merged, completeness };
}

/**
 * Create the Google Calendar provider used on Windows (and non-Darwin auto).
 */
export function createGoogleCalendarProvider(): CalendarProvider {
  return {
    id: "google-calendar",

    async getEvents(upstreamSignal: AbortSignal): Promise<CalendarResult> {
      // 60 s overall poll budget for list + pages + await of refresh/retry.
      // Composed with upstream coordinator signal; does not cancel shared OAuth.
      const budget = createPollBudgetSignal(GOOGLE_POLL_BUDGET_MS, upstreamSignal);
      try {
        let tokens = await ensureFreshGoogleAccessToken("if-needed");
        if (tokens === null) {
          return calendarErr(
            formatAppError({
              kind: "calendar-permission-denied",
              message: "Connect Google Calendar from the tray menu or Settings.",
            }),
            "permission-denied",
          );
        }

        try {
          const { events, completeness } = await fetchAllEvents(
            tokens.accessToken,
            tokens.email,
            budget.signal,
          );
          const observedAt = Date.now();
          // Only complete live snapshots may overwrite the encrypted cache.
          if (completeness === "complete") {
            await saveOfflineCache(events, observedAt);
          }
          return calendarLiveOk(events, completeness, observedAt);
        } catch (err) {
          if (err instanceof AuthError) {
            // API 401: force one real refresh, then one retry.
            const forced = await refreshGoogleAccessToken("force");
            if (forced.kind !== "ok") {
              if (forced.kind === "invalidated" || forced.kind === "no-tokens") {
                return calendarErr(
                  formatAppError({
                    kind: "calendar-auth",
                    message: "Google session expired. Please reconnect.",
                  }),
                  "permission-denied",
                );
              }
              // transient refresh failure — try offline, do not clear
            } else {
              tokens = forced.tokens;
              try {
                const { events, completeness } = await fetchAllEvents(
                  tokens.accessToken,
                  tokens.email,
                  budget.signal,
                );
                const observedAt = Date.now();
                if (completeness === "complete") {
                  await saveOfflineCache(events, observedAt);
                }
                return calendarLiveOk(events, completeness, observedAt);
              } catch (retryErr) {
                if (retryErr instanceof AuthError) {
                  await clearGoogleTokens();
                  return calendarErr(
                    formatAppError({
                      kind: "calendar-auth",
                      message: "Google session expired. Please reconnect.",
                    }),
                    "permission-denied",
                  );
                }
                throw retryErr;
              }
            }
          }

          // Network / other / transient force-refresh: try offline cache
          // Empty filtered list is still offline success (display + explicit join).
          const cache = await loadOfflineCache();
          if (cache !== null) {
            console.warn("[calendar:google] Network failure; using offline cache");
            return calendarOfflineOk(cache.events, cache.observedAt, cache.cachedAt);
          }

          const message = err instanceof Error ? err.message : String(err);
          return calendarErr(
            formatAppError({
              kind: "calendar-network",
              message: message || "Can't reach Google Calendar",
            }),
            "runtime",
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[calendar:google] getEvents error:", err);
        return calendarErr(formatAppError({ kind: "calendar-runtime", message }), "runtime");
      } finally {
        budget.cleanup();
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

    async getAccountLabel(): Promise<string | null> {
      return (await loadGoogleTokens())?.email ?? null;
    },

    isOAuthConfigured(): boolean {
      return isGoogleOAuthConfigured();
    },

    isOAuthInFlight(): boolean {
      return isGoogleOAuthInFlight();
    },

    async warmup(): Promise<void> {
      // Soft-refresh tokens if present; ignore failures
      await ensureFreshGoogleAccessToken().catch(() => null);
    },
  };
}
