/**
 * Pure helper for the renderer's "events arrived" path.
 *
 * Centralizes two concerns that previously lived inline at multiple sites in
 * `index.ts`:
 *
 * 1. Apply the `showTomorrowMeetings` filter to the incoming event list.
 * 2. Compare the resulting list against the previous post-filter signature so
 *    the renderer can skip a full re-render when nothing observable changed.
 *
 * The shared `eventListSignature` is used as the single source of truth so
 * main-process IPC gating and renderer DOM gating cannot drift apart.
 */

import type { AppState } from "../../shared/app-state.js";
import type { AppSettings } from "../../domain/entities/settings.js";
import type { MeetingEvent } from "../../domain/entities/meeting-event.js";
import { eventListSignature } from "../../domain/services/event-signature.js";
import { isTomorrow } from "../../domain/services/time.js";

export interface ApplyEventsPushInput {
  readonly events: readonly MeetingEvent[];
  readonly settings: AppSettings;
  readonly prevState: AppState;
  readonly prevSignature: string;
}

export interface ApplyEventsPushResult {
  readonly state: AppState;
  readonly signature: string;
  readonly didChange: boolean;
}

/**
 * Compute the next renderer state given a freshly received event list.
 *
 * `didChange` is `false` only when the post-filter signature matches the
 * previous signature and the previous state was already `has-events`. In every
 * other case (initial load, transition out of an error/permission/loading
 * state, list contents changed) the caller must re-render so the DOM reflects
 * the new state.
 */
export function applyEventsPush(input: ApplyEventsPushInput): ApplyEventsPushResult {
  const { events, settings, prevState, prevSignature } = input;
  const filtered = settings.showTomorrowMeetings
    ? events
    : events.filter((e) => !isTomorrow(e.startDate));

  const signature = eventListSignature(filtered);

  if (signature === prevSignature && prevState.type === "has-events") {
    return { state: prevState, signature, didChange: false };
  }

  const state: AppState =
    filtered.length === 0 ? { type: "no-events" } : { type: "has-events", events: [...filtered] };
  return { state, signature, didChange: true };
}
