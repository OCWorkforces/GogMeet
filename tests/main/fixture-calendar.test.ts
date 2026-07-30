import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { appState } = vi.hoisted(() => ({
  appState: { isPackaged: false },
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
  },
}));

vi.mock("../../src/main/platform/os.js", () => ({
  isDarwin: () => false,
  isWin32: () => true,
}));

import { createFixtureCalendarProvider } from "../../src/main/calendar/providers/fixture-calendar.js";
import {
  getActiveCalendarProvider,
  resetCalendarProvider,
} from "../../src/main/calendar/factory.js";

describe("fixture calendar provider", () => {
  let dir: string;
  let fixturePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gogmeet-fixture-"));
    fixturePath = join(dir, "events.json");
    resetCalendarProvider();
    appState.isPackaged = false;
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
  });

  afterEach(async () => {
    resetCalendarProvider();
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
    appState.isPackaged = false;
    await rm(dir, { recursive: true, force: true });
  });

  it("loads events from a JSON array file", async () => {
    await writeFile(
      fixturePath,
      JSON.stringify([
        {
          id: "fix-1",
          title: "Standup",
          startDate: "2026-04-08T15:00:00.000Z",
          endDate: "2026-04-08T15:30:00.000Z",
          calendarName: "Work",
          isAllDay: false,
          meetUrl: "https://meet.google.com/abc-defg-hij",
        },
      ]),
      "utf-8",
    );

    const provider = createFixtureCalendarProvider(fixturePath);
    expect(provider.id).toBe("fixture");
    expect(await provider.getPermissionStatus()).toBe("granted");

    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.title).toBe("Standup");
      expect(result.events[0]?.meetUrl).toBe("https://meet.google.com/abc-defg-hij");
    }
  });

  it("loads events from { events: [...] } wrapper", async () => {
    await writeFile(
      fixturePath,
      JSON.stringify({
        events: [
          {
            id: "fx-2",
            title: "Wrap",
            startDate: "2026-04-08T16:00:00.000Z",
            endDate: "2026-04-08T17:00:00.000Z",
            calendarName: "Personal",
            isAllDay: false,
          },
        ],
      }),
      "utf-8",
    );

    const result = await createFixtureCalendarProvider(fixturePath).getEvents();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.events[0]?.title).toBe("Wrap");
    }
  });

  it("returns err for missing file", async () => {
    const result = await createFixtureCalendarProvider(join(dir, "missing.json")).getEvents();
    expect(result.kind).toBe("err");
  });

  it("skips invalid events and maps optional meetUrl/userEmail/description", async () => {
    await writeFile(
      fixturePath,
      JSON.stringify([
        null,
        { id: 1 },
        {
          id: "bad-dates",
          title: "Bad",
          startDate: "not-iso",
          endDate: "nope",
          calendarName: "W",
          isAllDay: false,
        },
        {
          id: "ok-1",
          title: "Good",
          startDate: "2026-04-08T15:00:00.000Z",
          endDate: "2026-04-08T15:30:00.000Z",
          calendarName: "Work",
          isAllDay: false,
          meetUrl: "meet.google.com/abc-defg-hij",
          userEmail: "  a@b.com ",
          description: "notes",
        },
      ]),
      "utf-8",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await createFixtureCalendarProvider(fixturePath).getEvents(
      new AbortController().signal,
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.title).toBe("Good");
      expect(result.events[0]?.meetUrl).toContain("https://");
      expect(result.events[0]?.userEmail).toBe("a@b.com");
      expect(result.events[0]?.description).toBe("notes");
    }
    warn.mockRestore();
  });

  it("returns err for invalid JSON and wrong shape", async () => {
    await writeFile(fixturePath, "{not json", "utf-8");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r1 = await createFixtureCalendarProvider(fixturePath).getEvents(
      new AbortController().signal,
    );
    expect(r1.kind).toBe("err");

    await writeFile(fixturePath, JSON.stringify({ notEvents: [] }), "utf-8");
    const r2 = await createFixtureCalendarProvider(fixturePath).getEvents(
      new AbortController().signal,
    );
    expect(r2.kind).toBe("err");
    err.mockRestore();
  });
});

describe("factory fixture gate (K23)", () => {
  let dir: string;
  let fixturePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gogmeet-fixture-gate-"));
    fixturePath = join(dir, "events.json");
    await writeFile(
      fixturePath,
      JSON.stringify([
        {
          id: "gate-1",
          title: "Gate",
          startDate: "2026-04-08T15:00:00.000Z",
          endDate: "2026-04-08T15:30:00.000Z",
          calendarName: "Work",
          isAllDay: false,
        },
      ]),
      "utf-8",
    );
    resetCalendarProvider();
    appState.isPackaged = false;
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
  });

  afterEach(async () => {
    resetCalendarProvider();
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
    appState.isPackaged = false;
    await rm(dir, { recursive: true, force: true });
  });

  it("uses fixture when unpackaged and env path is set", async () => {
    process.env["GOGMEET_CALENDAR_FIXTURE"] = fixturePath;
    appState.isPackaged = false;
    const provider = await getActiveCalendarProvider();
    expect(provider.id).toBe("fixture");
  });

  it("ignores fixture env when packaged", async () => {
    process.env["GOGMEET_CALENDAR_FIXTURE"] = fixturePath;
    appState.isPackaged = true;
    const provider = await getActiveCalendarProvider();
    // Packaged non-Darwin → Google provider (not fixture)
    expect(provider.id).toBe("google-calendar");
  });

  it("uses google-calendar when unpackaged without env on non-Darwin", async () => {
    appState.isPackaged = false;
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
    const provider = await getActiveCalendarProvider();
    expect(provider.id).toBe("google-calendar");
  });


  it("handles object-with-events shape and missing file", async () => {
    await writeFile(
      fixturePath,
      JSON.stringify({
        events: [
          {
            id: "o1",
            title: "Obj",
            startDate: "2026-04-08T15:00:00.000Z",
            endDate: "2026-04-08T15:30:00.000Z",
            calendarName: "Work",
            isAllDay: false,
          },
        ],
      }),
    );
    process.env["GOGMEET_CALENDAR_FIXTURE"] = fixturePath;
    const provider = createFixtureCalendarProvider(fixturePath);
    const result = await provider.getEvents(new AbortController().signal);
    expect(result.kind).toBe("ok");
    const bad = createFixtureCalendarProvider(join(dir, "missing.json"));
    const errResult = await bad.getEvents(new AbortController().signal);
    expect(errResult.kind).toBe("err");
  });

  it("permission helpers always granted", async () => {
    await writeFile(fixturePath, "[]");
    const provider = createFixtureCalendarProvider(fixturePath);
    expect(await provider.getPermissionStatus()).toBe("granted");
    expect(await provider.requestPermission()).toBe("granted");
  });
});
