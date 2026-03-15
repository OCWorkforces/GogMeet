#!/usr/bin/env bun
/**
 * Dev orchestration: builds main+preload with rslib watch, starts rsbuild dev server,
 * then launches Electron — all coordinated with graceful shutdown.
 *
 * Fixed: Waits for dev server to be actually ready (HTTP health check) instead of
 * using a fixed timeout, preventing race condition crashes.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";

const procs: ChildProcess[] = [];

const DEV_SERVER_PORT = 5173;
const MAX_WAIT_MS = 30000; // Maximum time to wait for dev server
const POLL_INTERVAL_MS = 500;

function run(
  cmd: string,
  args: string[],
  env?: Record<string, string>,
): ChildProcess {
  const proc = spawn(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  procs.push(proc);
  return proc;
}

function killAll() {
  for (const p of procs) {
    try {
      p.kill();
    } catch {}
  }
}

process.on("SIGINT", () => {
  killAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  killAll();
  process.exit(0);
});

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the dev server is responding on the given port.
 * Uses a raw TCP connection instead of HTTP to avoid dependency issues.
 */
async function isDevServerReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "localhost" }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for the dev server to be ready, with timeout.
 */
async function waitForDevServer(
  port: number,
  maxWaitMs: number,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (await isDevServerReady(port)) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return false;
}

/**
 * Wait for build output files to exist.
 */
async function waitForBuildOutputs(maxWaitMs: number): Promise<boolean> {
  const startTime = Date.now();
  const requiredFiles = ["lib/main/index.cjs", "lib/preload/index.cjs"];

  while (Date.now() - startTime < maxWaitMs) {
    const allExist = requiredFiles.every((f) => existsSync(f));
    if (allExist) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return false;
}

async function main() {
  console.log("[dev] Starting rslib watch for main process...");
  run("bun", ["x", "rslib", "build", "--watch", "-c", "rslib.config.ts"]);

  console.log("[dev] Starting rslib watch for preload...");
  run("bun", [
    "x",
    "rslib",
    "build",
    "--watch",
    "-c",
    "rslib.config.preload.ts",
  ]);

  console.log("[dev] Starting rsbuild dev server for renderer...");
  run("bun", ["x", "rsbuild", "dev", "--port", String(DEV_SERVER_PORT)]);

  // Wait for build outputs to exist
  console.log("[dev] Waiting for build outputs...");
  const buildReady = await waitForBuildOutputs(MAX_WAIT_MS);
  if (!buildReady) {
    console.error("[dev] ERROR: Build outputs not found after 30s");
    killAll();
    process.exit(1);
  }
  console.log("[dev] Build outputs ready.");

  // Wait for dev server to be actually responding
  console.log(`[dev] Waiting for dev server on port ${DEV_SERVER_PORT}...`);
  const serverReady = await waitForDevServer(DEV_SERVER_PORT, MAX_WAIT_MS);
  if (!serverReady) {
    console.error(`[dev] ERROR: Dev server not responding after 30s`);
    killAll();
    process.exit(1);
  }
  console.log("[dev] Dev server is ready.");

  // Small additional delay to ensure server is fully initialized
  await sleep(500);

  console.log("[dev] Launching Electron...");
  const electron = run("bun", ["x", "electron", ".", "--disable-gpu-sandbox"], {
    ELECTRON_ENABLE_LOGGING: "1",
    VITE_DEV_SERVER_URL: `http://localhost:${DEV_SERVER_PORT}`,
  });

  electron.on("exit", (code) => {
    console.log(`[dev] Electron exited (${code}). Shutting down...`);
    killAll();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("[dev] Fatal:", err);
  killAll();
  process.exit(1);
});
