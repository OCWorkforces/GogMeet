import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  type: undefined,
}));

const { ensureBinaryMock } = vi.hoisted(() => ({
  ensureBinaryMock: vi.fn(),
}));
vi.mock("../../src/main/swift/binary-manager.js", () => ({
  ensureBinary: ensureBinaryMock,
}));

vi.mock("../../src/main/swift/binary-cache.js", () => ({
  BINARY_PATH: "/tmp/test-googlemeet-events",
}));

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

async function loadModule(): Promise<typeof import("../../src/main/swift/calendar-watch-sidecar.js")> {
  vi.resetModules();
  return await import("../../src/main/swift/calendar-watch-sidecar.js");
}

beforeEach(() => {
  spawnMock.mockReset();
  ensureBinaryMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("calendar-watch-sidecar", () => {
  describe("ensureBinary rejection", () => {
    it("schedules a restart when ensureBinary rejects so the sidecar can recover", async () => {
      const mod = await loadModule();
      ensureBinaryMock.mockRejectedValueOnce(new Error("compile failed"));
      const child = makeChild();
      spawnMock.mockReturnValueOnce(child);
      ensureBinaryMock.mockResolvedValueOnce(undefined);

      mod.startWatchSidecar(() => {});

      // Flush the rejected ensureBinary promise.
      await vi.advanceTimersByTimeAsync(0);
      // No child yet — ensureBinary failed.
      expect(spawnMock).not.toHaveBeenCalled();

      // First backoff is 1000ms (2^0 * 1000).
      await vi.advanceTimersByTimeAsync(1000);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      mod.stopWatchSidecar();
    });

    it("does not schedule restart after stop has been requested", async () => {
      const mod = await loadModule();
      let rejectFn: ((err: Error) => void) | null = null;
      ensureBinaryMock.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFn = reject;
          }),
      );

      mod.startWatchSidecar(() => {});
      mod.stopWatchSidecar();

      // Reject after stop — should not schedule a restart.
      rejectFn?.(new Error("compile failed"));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(spawnMock).not.toHaveBeenCalled();
    });
  });

  describe("restart timer", () => {
    it("calls unref() on the restart timer so it does not keep the event loop alive", async () => {
      const mod = await loadModule();

      // Capture every Timeout created so we can inspect unref calls.
      const realSetTimeout = global.setTimeout;
      const createdTimers: Array<{ delay: number; unrefCalls: number }> = [];
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");
      setTimeoutSpy.mockImplementation(((
        handler: () => void,
        delay?: number,
        ...args: unknown[]
      ) => {
        const timer = realSetTimeout(handler, delay, ...args) as ReturnType<
          typeof realSetTimeout
        >;
        const record = { delay: delay ?? 0, unrefCalls: 0 };
        createdTimers.push(record);
        const originalUnref = timer.unref.bind(timer);
        timer.unref = () => {
          record.unrefCalls += 1;
          return originalUnref();
        };
        return timer;
      }) as typeof setTimeout);

      ensureBinaryMock.mockRejectedValueOnce(new Error("fail"));
      mod.startWatchSidecar(() => {});
      await vi.advanceTimersByTimeAsync(0);

      // Find the restart timer (1000ms backoff) and verify unref was called.
      const restartTimer = createdTimers.find((t) => t.delay === 1_000);
      expect(restartTimer).toBeDefined();
      expect(restartTimer?.unrefCalls).toBeGreaterThanOrEqual(1);

      mod.stopWatchSidecar();
    });
  });

  describe("retry exhaustion", () => {
    it("gives up after MAX_RETRIES immediate spawn failures (no infinite loop)", async () => {
      const mod = await loadModule();
      ensureBinaryMock.mockResolvedValue(undefined);
      spawnMock.mockImplementation(() => {
        throw new Error("spawn EPERM");
      });

      mod.startWatchSidecar(() => {});
      await vi.advanceTimersByTimeAsync(0);
      // Attempt 1 already happened. Backoffs: 1s, 2s, 4s, 8s, 16s (5 retries total).
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(4_000);
      await vi.advanceTimersByTimeAsync(8_000);
      await vi.advanceTimersByTimeAsync(16_000);
      // Wait well past any further backoff window — must not restart again.
      await vi.advanceTimersByTimeAsync(60_000);

      // 1 initial + 5 retries = 6 spawn attempts max.
      expect(spawnMock.mock.calls.length).toBeLessThanOrEqual(6);
      // And we have actually hit the cap (>= 6 means we made all 5 retries).
      expect(spawnMock.mock.calls.length).toBe(6);

      mod.stopWatchSidecar();
    });

    it("resets retry count after the child has run stably, so later isolated failures get a fresh budget", async () => {
      const mod = await loadModule();
      ensureBinaryMock.mockResolvedValue(undefined);

      // Plan: crash 3 times immediately (retryCount climbs to 3), then the
      // 4th spawn returns a stable child that lives past the stability
      // window. After that, 5 more crashes must all be retried — proving the
      // retry budget reset. Without reset, only 2 retries would be left.
      const crashBeforeStable = 3;
      const crashAfterStable = 5;
      const totalCrashChildren = crashBeforeStable + crashAfterStable;
      const crashChildren: FakeChild[] = [];
      for (let i = 0; i < crashBeforeStable; i++) {
        const c = makeChild();
        crashChildren.push(c);
        spawnMock.mockReturnValueOnce(c);
      }
      const stableChild = makeChild();
      spawnMock.mockReturnValueOnce(stableChild);
      for (let i = 0; i < crashAfterStable; i++) {
        const c = makeChild();
        crashChildren.push(c);
        spawnMock.mockReturnValueOnce(c);
      }

      mod.startWatchSidecar(() => {});
      await vi.advanceTimersByTimeAsync(0);

      // Crash the first 3 children immediately, walking the backoff ladder.
      const initialDelays = [1_000, 2_000, 4_000];
      crashChildren[0]?.emit("exit", 1, null);
      for (let i = 0; i < initialDelays.length; i++) {
        await vi.advanceTimersByTimeAsync(initialDelays[i]!);
        // After delay, a new child has been spawned. Crash it (except last).
        if (i < initialDelays.length - 1) {
          crashChildren[i + 1]?.emit("exit", 1, null);
        }
      }
      // We have now spawned: crash1, crash2, crash3, stable (=4 spawns).
      expect(spawnMock.mock.calls.length).toBe(4);

      // Run stably past the stability window so retryCount resets.
      await vi.advanceTimersByTimeAsync(60_000);

      // Now crash the stable child and walk a fresh 5-retry ladder.
      stableChild.emit("exit", 1, null);
      const afterDelays = [1_000, 2_000, 4_000, 8_000, 16_000];
      for (let i = 0; i < afterDelays.length; i++) {
        await vi.advanceTimersByTimeAsync(afterDelays[i]!);
        const c = crashChildren[crashBeforeStable + i];
        if (c !== undefined) {
          c.emit("exit", 1, null);
        }
      }

      // Total spawns: 4 (before+stable) + 5 (after-reset retries) = 9.
      expect(spawnMock.mock.calls.length).toBe(1 + totalCrashChildren);

      mod.stopWatchSidecar();
    });

    it("does not reset retry count for immediate crash-on-start (no stable interval reached)", async () => {
      const mod = await loadModule();
      ensureBinaryMock.mockResolvedValue(undefined);

      // Every spawn returns a child that immediately exits with code 1 before
      // the stability window elapses. We must still cap at MAX_RETRIES.
      spawnMock.mockImplementation(() => {
        const c = makeChild();
        // Defer the crash so listeners are attached first.
        queueMicrotask(() => c.emit("exit", 1, null));
        return c;
      });

      mod.startWatchSidecar(() => {});
      // Flush microtasks + first crash.
      await vi.advanceTimersByTimeAsync(0);

      // Walk all five retry backoffs (1s,2s,4s,8s,16s) plus settle.
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(4_000);
      await vi.advanceTimersByTimeAsync(8_000);
      await vi.advanceTimersByTimeAsync(16_000);
      // Then wait far beyond any plausible backoff.
      await vi.advanceTimersByTimeAsync(120_000);

      // Cap of 1 + 5 = 6 spawns; never more.
      expect(spawnMock.mock.calls.length).toBe(6);

      mod.stopWatchSidecar();
    });
  });

  describe("idempotence", () => {
    it("startWatchSidecar called twice does not spawn twice", async () => {
      const mod = await loadModule();
      ensureBinaryMock.mockResolvedValue(undefined);
      const child = makeChild();
      spawnMock.mockReturnValueOnce(child);

      mod.startWatchSidecar(() => {});
      await vi.advanceTimersByTimeAsync(0);
      mod.startWatchSidecar(() => {});
      await vi.advanceTimersByTimeAsync(0);

      expect(spawnMock).toHaveBeenCalledTimes(1);
      mod.stopWatchSidecar();
    });
  });

  describe("ensureBinary retry preflight", () => {
    it("re-runs ensureBinary on the scheduled restart after an initial ensureBinary rejection", async () => {
      const mod = await loadModule();
      ensureBinaryMock.mockRejectedValueOnce(new Error("compile failed"));
      ensureBinaryMock.mockResolvedValueOnce(undefined);
      const child = makeChild();
      spawnMock.mockReturnValueOnce(child);

      mod.startWatchSidecar(() => {});
      // Flush the rejected ensureBinary promise.
      await vi.advanceTimersByTimeAsync(0);
      expect(ensureBinaryMock).toHaveBeenCalledTimes(1);
      expect(spawnMock).not.toHaveBeenCalled();

      // First backoff is 1000ms. Restart must re-run ensureBinary first.
      await vi.advanceTimersByTimeAsync(1_000);
      // Flush the resolved ensureBinary promise from the retry.
      await vi.advanceTimersByTimeAsync(0);

      expect(ensureBinaryMock).toHaveBeenCalledTimes(2);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      mod.stopWatchSidecar();
    });
  });

  describe("child error stability timer", () => {
    it("clears the stability timer when the child emits an error before exit", async () => {
      const mod = await loadModule();
      ensureBinaryMock.mockResolvedValue(undefined);

      // Capture clearTimeout calls so we can prove the stability timer is
      // cancelled on the error path (not only on exit).
      const realSetTimeout = global.setTimeout;
      const realClearTimeout = global.clearTimeout;
      const timerRegistry = new Map<
        ReturnType<typeof realSetTimeout>,
        { delay: number; cleared: boolean }
      >();
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");
      setTimeoutSpy.mockImplementation(((
        handler: () => void,
        delay?: number,
        ...args: unknown[]
      ) => {
        const timer = realSetTimeout(handler, delay, ...args) as ReturnType<
          typeof realSetTimeout
        >;
        timerRegistry.set(timer, { delay: delay ?? 0, cleared: false });
        return timer;
      }) as typeof setTimeout);
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      clearTimeoutSpy.mockImplementation(((
        timer?: ReturnType<typeof realSetTimeout>,
      ) => {
        if (timer !== undefined) {
          const entry = timerRegistry.get(timer);
          if (entry !== undefined) entry.cleared = true;
          realClearTimeout(timer);
        }
      }) as typeof clearTimeout);

      const firstChild = makeChild();
      spawnMock.mockReturnValueOnce(firstChild);

      mod.startWatchSidecar(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      // The stability timer is armed with delay = 60_000.
      const stabilityTimerEntry = Array.from(timerRegistry.entries()).find(
        ([, info]) => info.delay === 60_000,
      );
      expect(stabilityTimerEntry).toBeDefined();
      const stabilityInfo = stabilityTimerEntry?.[1];
      expect(stabilityInfo?.cleared).toBe(false);

      // Emit "error" on the child. Production must clear the stability timer
      // here so a failed-spawn child cannot later reset retryCount.
      firstChild.emit("error", new Error("ENOENT"));

      expect(stabilityInfo?.cleared).toBe(true);

      mod.stopWatchSidecar();
    });
  });
});
