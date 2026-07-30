import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CalendarResult } from "../../src/domain/entities/calendar-result.js";
import {
  bindCalendarRefreshFetcher,
  cancelCalendarRefresh,
  requestCalendarRefresh,
  getLastCalendarPublication,
  CalendarRefreshCancelledError,
  _resetCalendarRefreshCoordinatorForTest,
} from "../../src/main/calendar/refresh-coordinator.js";

function okResult(label: string, observedAt = Date.now()): CalendarResult {
  return {
    kind: "ok",
    source: "live",
    completeness: "complete",
    observedAt,
    events: [
      {
        id: label as never,
        title: label,
        startDate: "2026-07-30T10:00:00.000Z" as never,
        endDate: "2026-07-30T11:00:00.000Z" as never,
        calendarName: "Work",
        isAllDay: false,
        description: "",
        meetUrl: null,
        userEmail: null,
      },
    ],
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve = (_value: T): void => {};
  let reject = (_reason: unknown): void => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("calendar refresh coordinator", () => {
  beforeEach(() => {
    _resetCalendarRefreshCoordinatorForTest();
  });

  afterEach(() => {
    _resetCalendarRefreshCoordinatorForTest();
  });

  it("happy path: one request produces one provider call and one publication", async () => {
    const fetch = vi.fn().mockResolvedValue(okResult("solo"));
    bindCalendarRefreshFetcher(fetch);

    const publication = await requestCalendarRefresh();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(publication.publicationGeneration).toBe(1);
    expect(publication.result).toMatchObject({ kind: "ok" });
    expect(getLastCalendarPublication()).toEqual(publication);
  });

  it("ten concurrent requests produce at most current plus one follow-up", async () => {
    const first = createDeferred<CalendarResult>();
    const second = createDeferred<CalendarResult>();
    let calls = 0;
    bindCalendarRefreshFetcher((_signal) => {
      calls += 1;
      if (calls === 1) return first.promise;
      if (calls === 2) return second.promise;
      return Promise.resolve(okResult(`extra-${calls}`));
    });

    const waiters = Array.from({ length: 10 }, () => requestCalendarRefresh());
    await Promise.resolve();
    expect(calls).toBe(1);

    // While first is in flight, all waiters share the chain and only queue one follow-up.
    first.resolve(okResult("gen-1"));
    // Allow the follow-up to start before resolving it.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    second.resolve(okResult("gen-2"));

    const publications = await Promise.all(waiters);
    expect(calls).toBe(2);
    // All waiters resolve to the final (follow-up) publication.
    const gens = new Set(publications.map((p) => p.publicationGeneration));
    expect(gens.size).toBe(1);
    expect(publications[0]?.publicationGeneration).toBe(2);
    expect(getLastCalendarPublication()?.publicationGeneration).toBe(2);
  });

  it("older completion does not mutate lastPublication after a newer follow-up", async () => {
    const first = createDeferred<CalendarResult>();
    const second = createDeferred<CalendarResult>();
    let calls = 0;
    bindCalendarRefreshFetcher(() => {
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    });

    const waiterA = requestCalendarRefresh();
    // Queue follow-up before first completes.
    const waiterB = requestCalendarRefresh();
    await Promise.resolve();

    // Complete first (superseded) then second.
    first.resolve(okResult("stale"));
    await Promise.resolve();
    await Promise.resolve();
    second.resolve(okResult("fresh"));

    const [a, b] = await Promise.all([waiterA, waiterB]);
    expect(a.publicationGeneration).toBe(b.publicationGeneration);
    expect(a.result).toMatchObject({ kind: "ok" });
    if (a.result.kind === "ok") {
      expect(a.result.events[0]?.title).toBe("fresh");
    }
    expect(getLastCalendarPublication()?.publicationGeneration).toBe(2);
  });

  it("manual refresh cannot resolve without a publication", async () => {
    bindCalendarRefreshFetcher(async () => okResult("must-publish"));
    const publication = await requestCalendarRefresh();
    expect(publication).toMatchObject({
      publicationGeneration: expect.any(Number),
      result: { kind: "ok" },
    });
  });

  it("cancel aborts provider work and rejects waiters with CalendarRefreshCancelledError", async () => {
    const deferred = createDeferred<CalendarResult>();
    let seenSignal: AbortSignal | null = null;
    bindCalendarRefreshFetcher((signal) => {
      seenSignal = signal;
      return deferred.promise;
    });

    const pending = requestCalendarRefresh();
    await Promise.resolve();
    expect(seenSignal?.aborted).toBe(false);

    cancelCalendarRefresh();
    expect(seenSignal?.aborted).toBe(true);

    await expect(pending).rejects.toBeInstanceOf(CalendarRefreshCancelledError);
    expect(getLastCalendarPublication()).toBeNull();

    // New request after cancel starts clean under a new lifecycle.
    bindCalendarRefreshFetcher(async () => okResult("after-cancel"));
    const next = await requestCalendarRefresh();
    expect(next.publicationGeneration).toBeGreaterThanOrEqual(1);
    expect(next.result).toMatchObject({ kind: "ok" });
  });

  it("throws when fetcher is not bound", async () => {
    _resetCalendarRefreshCoordinatorForTest();
    await expect(requestCalendarRefresh()).rejects.toThrow(
      /fetcher is not bound/i,
    );
  });

  it("retries once when a follow-up is queued after a transient fetch failure", async () => {
    let calls = 0;
    bindCalendarRefreshFetcher(async () => {
      calls += 1;
      if (calls === 1) {
        // Queue follow-up before failure surfaces.
        void requestCalendarRefresh();
        throw new Error("transient");
      }
      return okResult("recovered");
    });

    const publication = await requestCalendarRefresh();
    expect(calls).toBe(2);
    expect(publication.result).toMatchObject({ kind: "ok" });
    if (publication.result.kind === "ok") {
      expect(publication.result.events[0]?.title).toBe("recovered");
    }
  });

  it("rejects immediately when the signal is already aborted", async () => {
    bindCalendarRefreshFetcher(async (signal) => {
      // Simulate a hang that only ends on abort.
      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
      return okResult("never");
    });

    const pending = requestCalendarRefresh();
    await Promise.resolve();
    cancelCalendarRefresh();
    await expect(pending).rejects.toBeInstanceOf(CalendarRefreshCancelledError);
  });

  it("propagates non-cancel fetch errors when no follow-up is queued", async () => {
    bindCalendarRefreshFetcher(async () => {
      throw new Error("hard-failure");
    });
    await expect(requestCalendarRefresh()).rejects.toThrow(/hard-failure/);
  });
});
