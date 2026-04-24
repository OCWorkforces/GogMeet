/**
 * Shared test utilities for GogMeet test suite.
 *
 * Centralises factory functions and common helpers that were previously
 * duplicated across many test files. Keep these factories small, fully typed,
 * and free of test-runner-specific imports so they can be used from any
 * vitest project (main / renderer).
 *
 * Import path convention from test files (note `.js` extension even for
 * `.ts` source — matches project ESM resolution):
 *
 *   import { createMockEvent } from "../helpers/test-utils.js";
 */

import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { EventId, IsoUtc, MeetUrl } from "../../src/shared/brand.js";
import { asEventId, asIsoUtc, asMeetUrl } from "../../src/shared/brand.js";
import type { MeetingEvent } from "../../src/shared/models.js";
import type { AppSettings } from "../../src/shared/settings.js";
import { DEFAULT_SETTINGS } from "../../src/shared/settings.js";

/**
 * Internal helper: run a brand validator and throw on failure. Test fixtures
 * use known-good inputs, so a failure here means the test author made a typo
 * — surfacing it as an immediate exception is the right behaviour.
 */
function unwrapBrand<B>(
  result: { ok: true; value: B } | { ok: false; error: string },
  label: string,
): B {
  if (!result.ok) {
    throw new Error(`test-utils: invalid ${label}: ${result.error}`);
  }
  return result.value;
}

/**
 * Returns an ISO-8601 (UTC) timestamp `minutes` minutes from `now`.
 * Negative values produce timestamps in the past.
 */
export function isoFromNow(minutes: number, now: number = Date.now()): string {
  return new Date(now + minutes * 60 * 1000).toISOString();
}

/** Validate-and-brand helper for tests that need a typed EventId. */
export function asTestEventId(raw: string): EventId {
  return unwrapBrand(asEventId(raw), "EventId");
}

/** Validate-and-brand helper for tests that need a typed IsoUtc. */
export function asTestIsoUtc(raw: string): IsoUtc {
  return unwrapBrand(asIsoUtc(raw), "IsoUtc");
}

/** Validate-and-brand helper for tests that need a typed MeetUrl. */
export function asTestMeetUrl(raw: string): MeetUrl {
  return unwrapBrand(asMeetUrl(raw), "MeetUrl");
}

/**
 * Default MeetingEvent used by `createMockEvent`. Matches the shape that the
 * pre-existing per-file `makeEvent` factories converged on:
 *  - id "test-id"
 *  - 5 minutes from now → 35 minutes from now
 *  - canonical Google Meet URL
 *  - calendarName "Work", isAllDay false, userEmail set
 */
function defaultEvent(): MeetingEvent {
  return {
    id: asTestEventId("test-id"),
    title: "Test Meeting",
    startDate: asTestIsoUtc(isoFromNow(5)),
    endDate: asTestIsoUtc(isoFromNow(35)),
    meetUrl: asTestMeetUrl("https://meet.google.com/abc-def-ghi"),
    calendarName: "Work",
    isAllDay: false,
    userEmail: "user@example.com",
  };
}

/**
 * Creates a fully-formed MeetingEvent with sensible defaults.
 *
 * All required fields are populated so the returned object is immediately
 * usable. Provide `overrides` to customise any subset of fields.
 */
export function createMockEvent(
  overrides: Partial<MeetingEvent> = {},
): MeetingEvent {
  return { ...defaultEvent(), ...overrides };
}

/**
 * Creates a fully-formed AppSettings object using DEFAULT_SETTINGS as the
 * base. Provide `overrides` to customise any subset of fields.
 */
export function createMockSettings(
  overrides: Partial<AppSettings> = {},
): AppSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

/**
 * Creates a minimal Electron `IpcMainInvokeEvent` suitable for unit tests
 * that exercise IPC handlers directly. The returned object intentionally
 * exposes only the surface area used by this codebase's handlers and
 * `validateSender` checks.
 *
 * Optional `sender` overrides let tests simulate different webContents
 * (e.g. different URLs or destroyed windows) without rebuilding the whole
 * event shape.
 */
export function createMockIpcEvent(
  sender: Partial<WebContents> = {},
): IpcMainInvokeEvent {
  const defaultSender: Partial<WebContents> = {
    getURL: () => "file:///app/index.html",
    isDestroyed: () => false,
    send: () => {},
  };
  const merged = { ...defaultSender, ...sender } as WebContents;
  // The Electron type for IpcMainInvokeEvent is structurally large; we only
  // surface the fields production code touches. The cast goes through
  // `unknown` (the language-blessed widening for unrelated structural types)
  // rather than `as any` so the explicit narrowing remains visible.
  const partial: Pick<
    IpcMainInvokeEvent,
    "sender" | "frameId" | "processId" | "senderFrame"
  > & { ports: MessagePort[] } = {
    sender: merged,
    frameId: 0,
    processId: 0,
    senderFrame: null as unknown as IpcMainInvokeEvent["senderFrame"],
    ports: [],
  };
  return partial as unknown as IpcMainInvokeEvent;
}
