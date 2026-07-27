/**
 * Composition binder — pure wiring (no network/OAuth/eager FS writes beyond factories).
 *
 * Formalizes default construction of use cases so lifecycle can rebind first.
 * Module-level defaults already work without this; call early in initializeApp
 * so tests and future adapters have a single composition entry.
 */

import { rebindCalendarDefaults } from "../facades/calendar.js";
import { rebindSettingsDefaults } from "../facades/settings.js";
import { rebindJoinMeetingDefaults } from "../utils/join-meeting.js";

export interface CompositionBindings {
  /** Reserved for future AppGraph-style handles */
  readonly bound: true;
}

/**
 * Wire production use-case defaults.
 * Safe to call multiple times; idempotent rebind of free-function delegates.
 */
export function bindComposition(): CompositionBindings {
  rebindCalendarDefaults();
  rebindSettingsDefaults();
  rebindJoinMeetingDefaults();
  return { bound: true };
}
