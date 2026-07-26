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

    const result = await provider.getEvents();
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
    expect(provider.id).toBe("stub-unsupported");
  });

  it("uses stub when unpackaged without env", async () => {
    appState.isPackaged = false;
    delete process.env["GOGMEET_CALENDAR_FIXTURE"];
    const provider = await getActiveCalendarProvider();
    expect(provider.id).toBe("stub-unsupported");
  });
});
