#!/usr/bin/env bun
/**
 * Dev orchestration: builds main+preload with rslib watch, starts rsbuild dev server,
 * then launches Electron — all coordinated with graceful shutdown.
 */
import { spawn, type ChildProcess } from 'node:child_process';

const procs: ChildProcess[] = [];

function run(cmd: string, args: string[], env?: Record<string, string>): ChildProcess {
  const proc = spawn(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  procs.push(proc);
  return proc;
}

function killAll() {
  for (const p of procs) {
    try { p.kill(); } catch {}
  }
}

process.on('SIGINT', () => { killAll(); process.exit(0); });
process.on('SIGTERM', () => { killAll(); process.exit(0); });

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('[dev] Starting rslib watch for main process...');
  run('bun', ['x', 'rslib', 'build', '--watch', '-c', 'rslib.config.ts']);

  console.log('[dev] Starting rslib watch for preload...');
  run('bun', ['x', 'rslib', 'build', '--watch', '-c', 'rslib.config.preload.ts']);

  console.log('[dev] Starting rsbuild dev server for renderer...');
  run('bun', ['x', 'rsbuild', 'dev', '--port', '5173']);

  // Wait for initial build to complete before starting Electron
  console.log('[dev] Waiting for initial builds (5s)...');
  await sleep(5000);

  console.log('[dev] Launching Electron...');
  const electron = run(
    'bun',
    ['x', 'electron', '.'],
    { ELECTRON_ENABLE_LOGGING: '1', VITE_DEV_SERVER_URL: 'http://localhost:5173' }
  );

  electron.on('exit', (code) => {
    console.log(`[dev] Electron exited (${code}). Shutting down...`);
    killAll();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[dev] Fatal:', err);
  killAll();
  process.exit(1);
});
