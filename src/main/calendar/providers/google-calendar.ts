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
import { asEventId, asIsoUtc } from "../../../domain/entities/brand.js";
import { formatAppError } from "../../../domain/entities/errors.js";
import { isObjectRecord } from "../../../domain/entities/type-guards.js";
import { cleanDescription } from "../../../domain/services/clean-description.js";
import { extractMeetingUrl } from "../../../domain/services/url-extract.js";
import { validateMeetUrl } from "../../../domain/services/url-validation.js";
import type { CalendarProvider } from "../provider.js";
import { clearGoogleTokens, loadGoogleTokens } from "../auth/google-token-store.js";
import {
  clearAllGoogleSyncTokens,
  clearGoogleSyncToken,
  loadGoogleSyncTokens,
  saveGoogleSyncTokens,
} from "../auth/google-sync-tokens.js";
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

/** Process-local event index for incremental merge (not a durable event DB). */
const workingEventsByCalendar = new Map<string, Map<string, MeetingEvent>>();

/** Internal page-chain outcome: complete vs hit MAX_PAGES with more pages remaining. */
type TraversalStatus = "complete" | "pagination-limit";

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

/** Thrown when a bounded Google page chain still has a nextPageToken after MAX_PAGES. */
class PaginationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaginationLimitError";
  }
}

/** HTTP 429 — distinct from generic NetworkError so incremental paths skip full-window retry. */
class RateLimitError extends Error {
  constructor(message: string = "Google API rate limited (429)") {
    super(message);
    this.name = "RateLimitError";
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
      if (err.errorClass === "rate-limit") {
        throw new RateLimitError(err.message);
      }
      throw new NetworkError(err.message);
    }
    throw err;
  }
}

async function listSelectedCalendarIds(
  accessToken: string,
  signal?: AbortSignal,
): Promise<{ status: TraversalStatus; calendarIds: string[] }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let status: TraversalStatus = "complete";

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const result = await googleFetch(url.toString(), accessToken, signal);
    if (!result.ok) {
      if (result.status === 401) throw new AuthError(result.body);
      if (result.status === 429) throw new RateLimitError(`calendarList rate limited (429)`);
      throw new NetworkError(`calendarList failed (${result.status})`);
    }
    if (!isObjectRecord(result.json) || !Array.isArray(result.json["items"])) {
      // First empty/malformed page → empty complete (primary default below).
      // Malformed after we already have IDs or pages → incomplete, never live complete.
      status = ids.length > 0 || page > 0 ? "pagination-limit" : "complete";
      break;
    }

    for (const item of result.json["items"]) {
      if (!isObjectRecord(item)) continue;
      const id = item["id"];
      if (typeof id !== "string") continue;
      if (item["selected"] === true || item["primary"] === true) {
        ids.push(id);
      }
    }

    const next = result.json["nextPageToken"];
    if (typeof next !== "string" || next.length === 0) {
      status = "complete";
      break;
    }
    pageToken = next;
    // Last allowed page still advertises more → incomplete traversal.
    if (page === MAX_PAGES - 1) {
      status = "pagination-limit";
    }
  }

  if (ids.length === 0) {
    ids.push("primary");
  }
  return { status, calendarIds: [...new Set(ids)] };
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
  // Extract join URLs from raw HTML descriptions before tag stripping (href-only links).
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

  const extracted = extractMeetingUrl(
    hangout,
    ...entryPoints,
    location,
    descriptionRaw,
    description,
  );
  let meetUrl: MeetingEvent["meetUrl"];
  if (extracted !== undefined) {
    const branded = validateMeetUrl(extracted);
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

class GoneError extends Error {
  constructor() {
    super("sync token expired");
    this.name = "GoneError";
  }
}

async function fetchEventsFullWindow(
  accessToken: string,
  calendarId: string,
  calendarName: string,
  userEmail: string | undefined,
  timeMin: string,
  timeMax: string,
  signal?: AbortSignal,
): Promise<
  | { status: "complete"; events: MeetingEvent[]; nextSyncToken: string | undefined }
  | { status: "pagination-limit" }
> {
  const events: MeetingEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

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
      if (result.status === 429) throw new RateLimitError(`events.list rate limited (429)`);
      if (result.status === 403 || result.status === 404) {
        console.warn(`[calendar:google] Skipping calendar ${calendarId}: HTTP ${result.status}`);
        return { status: "complete", events, nextSyncToken: undefined };
      }
      throw new NetworkError(`events.list failed (${result.status})`);
    }

    if (!isObjectRecord(result.json) || !Array.isArray(result.json["items"])) {
      // Mid-chain malformed: discard partial batch (do not commit incomplete state).
      if (page > 0 || events.length > 0) {
        return { status: "pagination-limit" };
      }
      return { status: "complete", events, nextSyncToken };
    }

    for (const item of result.json["items"]) {
      const mapped = mapGoogleEvent(item, calendarId, calendarName, userEmail);
      if (mapped) events.push(mapped);
    }

    const next = result.json["nextPageToken"];
    if (typeof next === "string" && next.length > 0) {
      pageToken = next;
      if (page === MAX_PAGES - 1) {
        // Discard incomplete batch — do not authorize events or nextSyncToken.
        return { status: "pagination-limit" };
      }
      continue;
    }
    const sync = result.json["nextSyncToken"];
    if (typeof sync === "string" && sync.length > 0) nextSyncToken = sync;
    return { status: "complete", events, nextSyncToken };
  }

  return { status: "pagination-limit" };
}

/**
 * Incremental events.list using a stored nextSyncToken.
 * Throws GoneError on HTTP 410 so callers wipe the token and full-sync.
 */
async function fetchEventsIncremental(
  accessToken: string,
  calendarId: string,
  calendarName: string,
  userEmail: string | undefined,
  syncToken: string,
  signal?: AbortSignal,
): Promise<
  | {
      status: "complete";
      upserts: MeetingEvent[];
      deletedIds: string[];
      nextSyncToken: string | undefined;
    }
  | { status: "pagination-limit" }
> {
  const upserts: MeetingEvent[] = [];
  const deletedIds: string[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let tokenParam: string | undefined = syncToken;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("conferenceDataVersion", "1");
    url.searchParams.set("maxResults", "250");
    if (tokenParam) url.searchParams.set("syncToken", tokenParam);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const result = await googleFetch(url.toString(), accessToken, signal);
    if (!result.ok) {
      if (result.status === 410) throw new GoneError();
      if (result.status === 401) throw new AuthError(result.body);
      if (result.status === 429) {
        // Preserve sync token + index; callers must not full-window retry this poll.
        throw new RateLimitError(`events.list incremental rate limited (429)`);
      }
      throw new NetworkError(`events.list incremental failed (${result.status})`);
    }
    if (!isObjectRecord(result.json) || !Array.isArray(result.json["items"])) {
      return { status: "complete", upserts, deletedIds, nextSyncToken };
    }

    for (const item of result.json["items"]) {
      if (!isObjectRecord(item)) continue;
      const idRaw = item["id"];
      if (typeof idRaw !== "string") continue;
      const branded = asEventId(`${calendarId}:${idRaw}`);
      if (!branded.ok) continue;
      if (item["status"] === "cancelled") {
        deletedIds.push(branded.value);
        continue;
      }
      const mapped = mapGoogleEvent(item, calendarId, calendarName, userEmail);
      if (mapped) upserts.push(mapped);
    }

    const next = result.json["nextPageToken"];
    if (typeof next === "string" && next.length > 0) {
      pageToken = next;
      tokenParam = undefined;
      if (page === MAX_PAGES - 1) {
        // Discard incomplete upserts/deletes — prior index/token stay authoritative.
        return { status: "pagination-limit" };
      }
      continue;
    }
    const sync = result.json["nextSyncToken"];
    if (typeof sync === "string" && sync.length > 0) nextSyncToken = sync;
    return { status: "complete", upserts, deletedIds, nextSyncToken };
  }

  return { status: "pagination-limit" };
}

function filterEventsInWindow(
  events: MeetingEvent[],
  timeMin: string,
  timeMax: string,
): MeetingEvent[] {
  const minMs = new Date(timeMin).getTime();
  const maxMs = new Date(timeMax).getTime();
  return events.filter((e) => {
    const start = new Date(e.startDate).getTime();
    const end = new Date(e.endDate).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > minMs && start < maxMs;
  });
}

/** Drop process-local index entries outside the poll window after incremental apply. */
function pruneIndexOutsideWindow(
  index: Map<string, MeetingEvent>,
  timeMin: string,
  timeMax: string,
): void {
  const minMs = new Date(timeMin).getTime();
  const maxMs = new Date(timeMax).getTime();
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return;
  for (const [id, event] of index) {
    const start = new Date(event.startDate).getTime();
    const end = new Date(event.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= minMs || start >= maxMs) {
      index.delete(id);
    }
  }
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
  const stored = (await loadGoogleSyncTokens())[calendarId];
  let index = workingEventsByCalendar.get(calendarId);
  if (!index) {
    index = new Map();
    workingEventsByCalendar.set(calendarId, index);
  }

  if (stored && index.size > 0) {
    try {
      const inc = await fetchEventsIncremental(
        accessToken,
        calendarId,
        calendarName,
        userEmail,
        stored,
        signal,
      );
      if (inc.status === "pagination-limit") {
        // Preserve index + stored nextSyncToken; do not apply incomplete upserts/deletes.
        throw new PaginationLimitError(
          `events.list incremental pagination limit for ${calendarId}`,
        );
      }
      for (const id of inc.deletedIds) index.delete(id);
      for (const ev of inc.upserts) index.set(ev.id, ev);
      pruneIndexOutsideWindow(index, timeMin, timeMax);
      if (inc.nextSyncToken) {
        const all = await loadGoogleSyncTokens();
        all[calendarId] = inc.nextSyncToken;
        await saveGoogleSyncTokens(all);
      }
      return filterEventsInWindow([...index.values()], timeMin, timeMax);
    } catch (err) {
      if (err instanceof PaginationLimitError) {
        throw err;
      }
      if (err instanceof RateLimitError) {
        // 429 must not amplify into a same-poll full-window request.
        throw err;
      }
      if (err instanceof GoneError) {
        await clearGoogleSyncToken(calendarId);
        index.clear();
        // fall through to full window
      } else if (err instanceof AuthError) {
        throw err;
      } else {
        // Incremental transport/5xx failure: fall back to full window for this poll.
        console.warn("[calendar:google] Incremental sync failed — full window fetch");
      }
    }
  }

  const full = await fetchEventsFullWindow(
    accessToken,
    calendarId,
    calendarName,
    userEmail,
    timeMin,
    timeMax,
    signal,
  );
  if (full.status === "pagination-limit") {
    // Preserve prior index/token; discard incomplete full-window batch.
    throw new PaginationLimitError(`events.list full pagination limit for ${calendarId}`);
  }
  index.clear();
  for (const ev of full.events) index.set(ev.id, ev);
  if (full.nextSyncToken) {
    const all = await loadGoogleSyncTokens();
    all[calendarId] = full.nextSyncToken;
    await saveGoogleSyncTokens(all);
  }
  return full.events;
}

async function fetchAllEvents(
  accessToken: string,
  userEmail: string | undefined,
  signal?: AbortSignal,
): Promise<{ events: MeetingEvent[]; completeness: "complete" | "partial" }> {
  const { timeMin, timeMax } = dayBoundsLocal();
  const list = await listSelectedCalendarIds(accessToken, signal);
  const calendarIds = list.calendarIds;
  const listIncomplete = list.status === "pagination-limit";
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
  // All selected calendars fully traversed and calendar-list complete → complete.
  // Incomplete calendar-list, or any failed/pagination-limited calendar → partial.
  const completeness: "complete" | "partial" =
    !listIncomplete && failedCount === 0 && successCount === calendarIds.length
      ? "complete"
      : "partial";
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
      await clearAllGoogleSyncTokens();
      workingEventsByCalendar.clear();
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
