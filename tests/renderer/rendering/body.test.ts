import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderBody } from "../../../src/renderer/rendering/body.js";
import {
  createMockEvent,
  createMockSettings,
  isoFromNow,
  asTestEventId,
  asTestIsoUtc,
  asTestMeetUrl,
} from "../../helpers/test-utils.js";

describe("renderBody", () => {
  // Pin time so relative-time labels and isTomorrow() are deterministic.
  // 2026-06-15T10:00:00Z → a Monday morning, not near midnight.
  const FIXED_NOW = new Date("2026-06-15T10:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("loading state", () => {
    it("renders spinner and loading text", () => {
      const html = renderBody({ type: "loading" }, createMockSettings());
      expect(html).toContain('class="spinner"');
      expect(html).toContain("Loading your meetings...");
      expect(html).toContain('class="state-screen"');
    });
  });

  describe("no-permission state", () => {
    it("renders grant-access button when not retrying", () => {
      const html = renderBody(
        { type: "no-permission", retrying: false },
        createMockSettings(),
      );
      expect(html).toContain("Calendar Access Needed");
      expect(html).toContain('data-action="grant-access"');
      expect(html).toContain("Grant Access");
      expect(html).not.toContain("disabled");
    });

    it("renders disabled button with 'Requesting...' label when retrying", () => {
      const html = renderBody(
        { type: "no-permission", retrying: true },
        createMockSettings(),
      );
      expect(html).toContain("Requesting...");
      expect(html).toContain("disabled");
    });
  });

  describe("no-events state", () => {
    it("renders empty state with today-only desc when showTomorrowMeetings is false", () => {
      const html = renderBody(
        { type: "no-events" },
        createMockSettings({ showTomorrowMeetings: false }),
      );
      expect(html).toContain("No upcoming meetings");
      expect(html).toContain("No calendar events found for today.");
      expect(html).not.toContain("tomorrow");
    });

    it("renders today-and-tomorrow desc when showTomorrowMeetings is true", () => {
      const html = renderBody(
        { type: "no-events" },
        createMockSettings({ showTomorrowMeetings: true }),
      );
      expect(html).toContain("today or tomorrow");
    });
  });

  describe("error state", () => {
    it("renders escaped error message and retry button", () => {
      const html = renderBody(
        { type: "error", message: "Boom <script>alert(1)</script>" },
        createMockSettings(),
      );
      expect(html).toContain("Something went wrong");
      expect(html).toContain('data-action="retry"');
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>alert(1)</script>");
    });
  });

  describe("has-events state", () => {
    it("renders upcoming meetings with title, join button, and section header", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-1"),
        title: "Standup",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).toContain('class="section-header"');
      expect(html).toContain("Today");
      expect(html).toContain('class="meeting-title"');
      expect(html).toContain("Standup");
      expect(html).toContain('data-action="join-meeting"');
      expect(html).toContain('data-url="https://meet.google.com/abc-def-ghi"');
    });

    it("renders 'All done for today!' when only past events exist", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-past"),
        title: "Old Meeting",
        startDate: asTestIsoUtc(isoFromNow(-60)),
        endDate: asTestIsoUtc(isoFromNow(-30)),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).toContain("All done for today!");
      expect(html).toContain("No more upcoming meetings.");
      expect(html).not.toContain('class="meeting-title"');
    });

    it("renders only upcoming when both past and future events exist", () => {
      const past = createMockEvent({
        id: asTestEventId("evt-past"),
        title: "Past Meeting",
        startDate: asTestIsoUtc(isoFromNow(-60)),
        endDate: asTestIsoUtc(isoFromNow(-30)),
      });
      const future = createMockEvent({
        id: asTestEventId("evt-future"),
        title: "Future Meeting",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
      });
      const html = renderBody(
        { type: "has-events", events: [past, future] },
        createMockSettings(),
      );

      expect(html).toContain("Future Meeting");
      expect(html).not.toContain("Past Meeting");
      expect(html).not.toContain("All done for today!");
    });

    it("escapes special characters in meeting titles", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-xss"),
        title: '<img src=x onerror="alert(1)"> & "Quoted"',
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).toContain("&lt;img src=x onerror=");
      expect(html).toContain("&amp;");
      expect(html).toContain("&quot;Quoted&quot;");
      expect(html).not.toContain('<img src=x onerror="alert(1)">');
    });

    it("renders auto-join badge for events with meetUrl that are not all-day", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-auto"),
        title: "Auto Meeting",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
        isAllDay: false,
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings({ openBeforeMinutes: 1 }),
      );

      expect(html).toContain('class="badge-auto"');
      expect(html).toContain("⚡ Auto");
      expect(html).toContain("1 min");
    });

    it("uses plural 'mins' in auto-join badge tooltip when openBeforeMinutes > 1", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-auto-5"),
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings({ openBeforeMinutes: 5 }),
      );

      expect(html).toContain("5 mins before");
    });

    it("does NOT render auto-join badge for all-day events", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-allday"),
        title: "All Day",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
        isAllDay: true,
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).not.toContain('class="badge-auto"');
    });

    it("does NOT render Join button or auto-join badge for events without meetUrl", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-nourl"),
        title: "No URL",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
        meetUrl: undefined,
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).not.toContain('data-action="join-meeting"');
      expect(html).not.toContain('class="badge-auto"');
      expect(html).toContain("No URL");
    });

    it("renders empty title gracefully without throwing", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-empty"),
        title: "",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).toContain('class="meeting-title"');
      // Empty title produces an empty span body, but the structure is intact.
      expect(html).toContain('title=""');
    });

    it("renders multiple meetings in order with dividers between them", () => {
      const event1 = createMockEvent({
        id: asTestEventId("evt-1"),
        title: "First Meeting",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
      });
      const event2 = createMockEvent({
        id: asTestEventId("evt-2"),
        title: "Second Meeting",
        startDate: asTestIsoUtc(isoFromNow(90)),
        endDate: asTestIsoUtc(isoFromNow(120)),
      });
      const event3 = createMockEvent({
        id: asTestEventId("evt-3"),
        title: "Third Meeting",
        startDate: asTestIsoUtc(isoFromNow(150)),
        endDate: asTestIsoUtc(isoFromNow(180)),
      });
      const html = renderBody(
        { type: "has-events", events: [event1, event2, event3] },
        createMockSettings(),
      );

      const idx1 = html.indexOf("First Meeting");
      const idx2 = html.indexOf("Second Meeting");
      const idx3 = html.indexOf("Third Meeting");
      expect(idx1).toBeGreaterThan(-1);
      expect(idx2).toBeGreaterThan(idx1);
      expect(idx3).toBeGreaterThan(idx2);

      // 3 meetings → 2 dividers between them.
      const dividerCount = (
        html.match(/class="meeting-divider"/g) ?? []
      ).length;
      expect(dividerCount).toBe(2);
    });

    it("renders 'In progress' label for meetings that started but have not ended", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-now"),
        title: "Live Meeting",
        startDate: asTestIsoUtc(isoFromNow(-5)),
        endDate: asTestIsoUtc(isoFromNow(25)),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).toContain("In progress");
      expect(html).toContain('class="meeting-time now"');
    });

    it("renders 'In X min' soon label for meetings within 15 minutes", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-soon"),
        title: "Soon Meeting",
        startDate: asTestIsoUtc(isoFromNow(10)),
        endDate: asTestIsoUtc(isoFromNow(40)),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).toContain("In 10 min");
      expect(html).toContain('class="meeting-time soon"');
    });

    it("escapes calendar names and meet URLs", () => {
      const event = createMockEvent({
        id: asTestEventId("evt-cal"),
        title: "Cal Meeting",
        startDate: asTestIsoUtc(isoFromNow(30)),
        endDate: asTestIsoUtc(isoFromNow(60)),
        calendarName: 'Work & "Home"',
        meetUrl: asTestMeetUrl("https://meet.google.com/xyz-abcd-efg"),
      });
      const html = renderBody(
        { type: "has-events", events: [event] },
        createMockSettings(),
      );

      expect(html).toContain("Work &amp; &quot;Home&quot;");
      expect(html).toContain('data-url="https://meet.google.com/xyz-abcd-efg"');
    });
  });
});
