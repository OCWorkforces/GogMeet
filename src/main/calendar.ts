import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MeetingEvent, CalendarPermission } from '../shared/types.js';

const execFileAsync = promisify(execFile);
const __dirname = join(fileURLToPath(import.meta.url), '..');

/** Path to bundled Swift source file */
const SWIFT_SRC_DEV = join(__dirname, '..', '..', 'src', 'main', 'gimeet-events.swift');

/** Cached compiled binary location */
const BINARY_DIR = join(tmpdir(), 'gimeet');
const BINARY_PATH = join(BINARY_DIR, 'gimeet-events');

/** Sidecar file storing the SHA-256 hash of the Swift source used for the current binary */
const HASH_PATH = join(BINARY_DIR, 'source.hash');

async function computeSwiftSourceHash(swiftSrc: string): Promise<string> {
  const content = await readFile(swiftSrc);
  return createHash('sha256').update(content).digest('hex');
}


/** Compile the Swift EventKit helper if not already compiled */
async function ensureBinary(): Promise<void> {
  // Locate Swift source (dev: from src/, packaged: from Resources/app/src/main/)
  let swiftSrc = SWIFT_SRC_DEV;
  try {
    await access(swiftSrc, constants.R_OK);
  } catch {
    swiftSrc = join(
      process.resourcesPath,
      'app',
      'src',
      'main',
      'gimeet-events.swift'
    );
  }

  await mkdir(BINARY_DIR, { recursive: true });

  // Compute hash of current Swift source
  const currentHash = await computeSwiftSourceHash(swiftSrc);

  // Check if binary exists AND hash matches
  try {
    await access(BINARY_PATH, constants.X_OK);
    const storedHash = await readFile(HASH_PATH, 'utf-8').catch(() => '');
    if (storedHash.trim() === currentHash) {
      return; // binary is up-to-date
    }
    // Hash changed — delete stale binary and recompile
    console.log('[calendar] Swift source changed — recompiling binary');
    await unlink(BINARY_PATH).catch(() => {});
  } catch {
    // Binary doesn't exist — need to compile
  }

  // Compile
  try {
    await execFileAsync('swiftc', [swiftSrc, '-o', BINARY_PATH], { timeout: 60_000 });
  } catch {
    await execFileAsync(
      'swiftc',
      [
        swiftSrc,
        '-o',
        BINARY_PATH,
        '-sdk',
        '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk',
      ],
      { timeout: 60_000 }
    );
  }

  // Store hash for future comparisons
  await writeFile(HASH_PATH, currentHash, 'utf-8');
}

/** Run the compiled Swift EventKit helper and return raw output */
async function runSwiftHelper(): Promise<string> {
  await ensureBinary();
  const { stdout } = await execFileAsync(BINARY_PATH, [], { timeout: 15_000 });
  return stdout.trim();
}

/** Parse pipe-delimited output from Swift helper into MeetingEvent[] */
export function parseEvents(raw: string): MeetingEvent[] {
  if (!raw) return [];

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const searchEnd = new Date(todayMidnight);
  searchEnd.setDate(searchEnd.getDate() + 2);

  const seen = new Set<string>();

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line): MeetingEvent[] => {
      const parts = line.split('\t');
      if (parts.length < 7) return [];

      const [id, title, startStr, endStr, urlField, calendarName, allDayStr, emailField] = parts as [
        string, string, string, string, string, string, string, string | undefined
      ];

      const meetUrl = urlField.trim() || undefined;

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

      // Guard: only today + tomorrow
      if (startDate < todayMidnight || startDate >= searchEnd) return [];

      // Deduplicate by id
      const uid = id.trim();
      if (seen.has(uid)) return [];
      seen.add(uid);

      return [
        {
          id: uid,
          title: title.trim(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          ...(meetUrl ? { meetUrl } : {}),
          calendarName: calendarName.trim(),
          isAllDay: allDayStr.trim() === 'true',
          ...(emailField?.trim() ? { userEmail: emailField.trim() } : {}),
        },
      ];
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

/** Fetch Google Meet events via EventKit Swift helper */
export async function getCalendarEvents(): Promise<MeetingEvent[]> {
  try {
    const output = await runSwiftHelper();
    return parseEvents(output);
  } catch (err) {
    console.error('[calendar] getCalendarEvents error:', err);
    return [];
  }
}

/** Run an inline AppleScript for permission checks (fast, no event queries) */
async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 10_000 });
  return stdout.trim();
}

/** Trigger permission dialog by accessing Calendar */
export async function requestCalendarPermission(): Promise<CalendarPermission> {
  try {
    await runAppleScript(`
      tell application "Calendar"
        get name of calendars
      end tell
    `);
    return 'granted';
  } catch {
    return 'denied';
  }
}

/** Check current calendar permission state without triggering dialog */
export async function getCalendarPermissionStatus(): Promise<CalendarPermission> {
  try {
    await runAppleScript(`
      tell application "Calendar"
        get name of first calendar
      end tell
    `);
    return 'granted';
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not authorized') || msg.includes('1743')) {
      return 'denied';
    }
    if (msg.includes('2700') || msg.includes('not determined')) {
      return 'not-determined';
    }
    return 'not-determined';
  }
}
