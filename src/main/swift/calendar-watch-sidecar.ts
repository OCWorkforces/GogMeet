import { spawn, type ChildProcess } from "node:child_process";

import { BINARY_PATH } from "./binary-cache.js";
import { ensureBinary } from "./binary-manager.js";

const DEBOUNCE_MS = 2000;
const MAX_RETRIES = 5;
const BACKOFF_MAX_MS = 30_000;
const KILL_GRACE_MS = 5000;

let child: ChildProcess | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let killTimer: ReturnType<typeof setTimeout> | null = null;
let stdoutBuffer = "";
let retryCount = 0;
let stopped = false;
let onChangeCallback: (() => void) | null = null;

function scheduleRestart(): void {
  if (stopped) return;
  if (retryCount >= MAX_RETRIES) {
    console.error(
      `[calendar-watch-sidecar] Giving up after ${MAX_RETRIES} restart attempts`,
    );
    return;
  }
  const delay = Math.min(1000 * 2 ** retryCount, BACKOFF_MAX_MS);
  retryCount++;
  console.warn(
    `[calendar-watch-sidecar] Restarting in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`,
  );
  if (restartTimer !== null) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    spawnChild();
  }, delay);
}

function handleStdoutChunk(chunk: Buffer): void {
  stdoutBuffer += chunk.toString("utf-8");
  let newlineIdx = stdoutBuffer.indexOf("\n");
  while (newlineIdx !== -1) {
    const line = stdoutBuffer.slice(0, newlineIdx);
    stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
    if (line.includes("CHANGED")) {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        try {
          onChangeCallback?.();
        } catch (err) {
          console.error("[calendar-watch-sidecar] onChange callback threw:", err);
        }
      }, DEBOUNCE_MS);
    }
    newlineIdx = stdoutBuffer.indexOf("\n");
  }
}

function spawnChild(): void {
  if (stopped) return;
  if (child !== null) return;

  let proc: ChildProcess;
  try {
    proc = spawn(BINARY_PATH, ["--watch"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    console.error("[calendar-watch-sidecar] Failed to spawn:", err);
    scheduleRestart();
    return;
  }

  child = proc;
  stdoutBuffer = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    handleStdoutChunk(chunk);
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    console.warn("[calendar-watch-sidecar] stderr:", chunk.toString("utf-8").trim());
  });

  proc.on("error", (err: Error) => {
    console.error("[calendar-watch-sidecar] Process error:", err.message);
    if (child === proc) child = null;
    scheduleRestart();
  });

  proc.on("exit", (code, signal) => {
    if (child === proc) child = null;
    if (stopped) {
      console.log("[calendar-watch-sidecar] Process exited during shutdown");
      return;
    }
    if (code === 0) {
      console.warn("[calendar-watch-sidecar] Process exited cleanly (code 0) — restarting");
    } else {
      console.error(
        `[calendar-watch-sidecar] Process exited with code=${code} signal=${signal}`,
      );
    }
    scheduleRestart();
  });

  console.log("[calendar-watch-sidecar] Spawned Swift --watch process");
}

/**
 * Start the long-running Swift `--watch` sidecar that emits `CHANGED` lines on
 * stdout when macOS Calendar data mutates. Debounces 2s before invoking
 * `onChange`. Crash-recovers with exponential backoff (1s, 2s, 4s, 8s, 16s,
 * capped at 30s) up to 5 attempts. Idempotent — calling while running is a
 * no-op.
 */
export function startWatchSidecar(onChange: () => void): void {
  if (child !== null || restartTimer !== null) return;

  stopped = false;
  retryCount = 0;
  onChangeCallback = onChange;

  ensureBinary()
    .then(() => {
      if (stopped) return;
      spawnChild();
    })
    .catch((err: unknown) => {
      console.error(
        "[calendar-watch-sidecar] ensureBinary failed:",
        err instanceof Error ? err.message : err,
      );
    });
}

/**
 * Stop the sidecar. Clears the debounce/restart timers, sends SIGTERM to the
 * child, and escalates to SIGKILL after 5s if still alive. Safe to call
 * multiple times.
 */
export function stopWatchSidecar(): void {
  stopped = true;
  onChangeCallback = null;

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (restartTimer !== null) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (killTimer !== null) {
    clearTimeout(killTimer);
    killTimer = null;
  }

  const proc = child;
  if (proc !== null) {
    child = null;
    try {
      proc.kill("SIGTERM");
    } catch (err) {
      console.warn("[calendar-watch-sidecar] SIGTERM failed:", err);
    }
    killTimer = setTimeout(() => {
      killTimer = null;
      if (proc.exitCode === null && proc.signalCode === null) {
        try {
          proc.kill("SIGKILL");
        } catch (err) {
          console.warn("[calendar-watch-sidecar] SIGKILL failed:", err);
        }
      }
    }, KILL_GRACE_MS);
    // Don't keep the event loop alive solely for the kill grace timer.
    killTimer.unref?.();
  }

  stdoutBuffer = "";
  retryCount = 0;
}
