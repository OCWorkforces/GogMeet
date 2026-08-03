import { describe, expect, it } from "vitest";

import {
  EVENT_SIGNATURE_FIELDS,
  eventListSignature,
  eventSignature,
} from "../../src/domain/services/event-signature.js";
import type { MeetingEvent } from "../../src/domain/entities/meeting-event.js";
import { asTestEventId, asTestIsoUtc, asTestMeetUrl } from "../helpers/test-utils.js";

function makeEvent(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  const base: MeetingEvent = {
    id: asTestEventId("evt-1"),
    title: "Standup",
    startDate: asTestIsoUtc("2025-01-01T10:00:00Z"),
    endDate: asTestIsoUtc("2025-01-01T10:30:00Z"),
    meetUrl: asTestMeetUrl("https://meet.google.com/abc-defg-hij"),
    calendarName: "Work",
    isAllDay: false,
    userEmail: "user@example.com",
    description: "Daily standup notes",
  };
  return { ...base, ...overrides };
}

describe("EVENT_SIGNATURE_FIELDS", () => {
  it("is a frozen, deterministic list of participating fields", () => {
    expect(EVENT_SIGNATURE_FIELDS).toEqual([
      "calendarName",
      "endDate",
      "id",
      "isAllDay",
      "meetUrl",
      "startDate",
      "title",
      "userEmail",
    ]);
    expect(Object.isFrozen(EVENT_SIGNATURE_FIELDS)).toBe(true);
  });

  it("does not include the description field", () => {
    expect(EVENT_SIGNATURE_FIELDS).not.toContain("description");
  });
});

describe("eventSignature", () => {
  it("is deterministic for the same event", () => {
    const e = makeEvent();
    expect(eventSignature(e)).toBe(eventSignature(e));
  });

  it("is independent of object key insertion order", () => {
    const a = makeEvent();
    // Reconstruct with different key order; the signature must be the same.
    const reordered: MeetingEvent = {
      description: a.description,
      userEmail: a.userEmail,
      isAllDay: a.isAllDay,
      calendarName: a.calendarName,
      meetUrl: a.meetUrl,
      endDate: a.endDate,
      startDate: a.startDate,
      title: a.title,
      id: a.id,
    };
    expect(eventSignature(reordered)).toBe(eventSignature(a));
  });

  it("changes when a participating field changes", () => {
    const base = eventSignature(makeEvent());
    expect(eventSignature(makeEvent({ title: "Sync" }))).not.toBe(base);
    expect(eventSignature(makeEvent({ startDate: asTestIsoUtc("2025-01-01T11:00:00Z") }))).not.toBe(
      base,
    );
    expect(eventSignature(makeEvent({ endDate: asTestIsoUtc("2025-01-01T12:00:00Z") }))).not.toBe(
      base,
    );
    expect(eventSignature(makeEvent({ calendarName: "Personal" }))).not.toBe(base);
    expect(eventSignature(makeEvent({ isAllDay: true }))).not.toBe(base);
    expect(eventSignature(makeEvent({ id: asTestEventId("evt-2") }))).not.toBe(base);
    expect(
      eventSignature(makeEvent({ meetUrl: asTestMeetUrl("https://meet.google.com/xyz-pqrs-tuv") })),
    ).not.toBe(base);
    expect(eventSignature(makeEvent({ userEmail: "other@example.com" }))).not.toBe(base);
  });

  it("does not change when a non-participating field changes", () => {
    const a = eventSignature(makeEvent({ description: "first notes" }));
    const b = eventSignature(makeEvent({ description: "completely different" }));
    const c = eventSignature(makeEvent({ description: undefined }));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("distinguishes absent vs empty optional fields", () => {
    const withUrl = eventSignature(makeEvent());
    const withoutUrl = eventSignature(makeEvent({ meetUrl: undefined }));
    expect(withUrl).not.toBe(withoutUrl);

    const withEmail = eventSignature(makeEvent());
    const withoutEmail = eventSignature(makeEvent({ userEmail: undefined }));
    expect(withEmail).not.toBe(withoutEmail);
  });
});

describe("eventListSignature", () => {
  it("changes when the same event id is rescheduled (start/end)", () => {
    const id = asTestEventId("standup");
    const morning = makeEvent({
      id,
      startDate: asTestIsoUtc("2026-08-03T09:00:00Z"),
      endDate: asTestIsoUtc("2026-08-03T09:30:00Z"),
    });
    const evening = makeEvent({
      id,
      startDate: asTestIsoUtc("2026-08-03T18:00:00Z"),
      endDate: asTestIsoUtc("2026-08-03T18:30:00Z"),
    });
    expect(eventListSignature([morning])).not.toBe(eventListSignature([evening]));
  });

  it("is independent of input array order (stable ordering)", () => {
    const a = makeEvent({ id: asTestEventId("a") });
    const b = makeEvent({ id: asTestEventId("b"), title: "B" });
    const c = makeEvent({ id: asTestEventId("c"), title: "C" });
    expect(eventListSignature([a, b, c])).toBe(eventListSignature([c, a, b]));
    expect(eventListSignature([a, b, c])).toBe(eventListSignature([b, c, a]));
  });

  it("distinguishes lists of different length", () => {
    const a = makeEvent({ id: asTestEventId("a") });
    const b = makeEvent({ id: asTestEventId("b") });
    expect(eventListSignature([a])).not.toBe(eventListSignature([a, b]));
  });

  it("returns a stable empty marker for an empty list", () => {
    expect(eventListSignature([])).toBe(eventListSignature([]));
  });

  it("ignores non-participating field changes across the list", () => {
    const a = makeEvent({ id: asTestEventId("a"), description: "x" });
    const b = makeEvent({ id: asTestEventId("b"), description: "y" });
    const aPrime = makeEvent({ id: asTestEventId("a"), description: "different" });
    const bPrime = makeEvent({ id: asTestEventId("b"), description: "also different" });
    expect(eventListSignature([a, b])).toBe(eventListSignature([aPrime, bPrime]));
  });

  it("changes when a participating field of any element changes", () => {
    const a = makeEvent({ id: asTestEventId("a") });
    const b = makeEvent({ id: asTestEventId("b") });
    const bPrime = makeEvent({ id: asTestEventId("b"), title: "Updated" });
    expect(eventListSignature([a, b])).not.toBe(eventListSignature([a, bPrime]));
  });
});
