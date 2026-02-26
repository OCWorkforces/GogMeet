import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { MeetingEvent, CalendarPermission } from '../shared/types.js';

const execFileAsync = promisify(execFile);

/** Regex for Google Meet URLs */
const MEET_URL_REGEX = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/gi;

/** AppleScript: get all calendar events for today + tomorrow with Meet URLs */
const GET_EVENTS_SCRIPT = `
set today to current date
set tomorrow to today + (1 * days)
set eventList to {}

tell application "Calendar"
  repeat with cal in calendars
    try
      set calName to name of cal
      set dayEvents to (events of cal whose start date >= today and start date < (tomorrow + (1 * days)))
      repeat with e in dayEvents
        try
          set eTitle to summary of e
          set eStart to start date of e
          set eEnd to end date of e
          set eLoc to location of e
          set eNotes to description of e
          set eAllDay to allday event of e
          set eUID to uid of e
          set meetUrl to ""
          if eLoc contains "meet.google.com" then
            set meetUrl to eLoc
          else if eNotes contains "meet.google.com" then
            -- extract URL from notes
            set meetUrl to "NOTES:" & eNotes
          end if
          if meetUrl is not "" then
            set eventList to eventList & {eUID & "||" & eTitle & "||" & (eStart as string) & "||" & (eEnd as string) & "||" & meetUrl & "||" & calName & "||" & (eAllDay as string)}
          end if
        end try
      end repeat
    end try
  end repeat
end tell

set AppleScript's text item delimiters to "\n"
return eventList as string
`;

/** Run an AppleScript string and return stdout */
async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script]);
  return stdout.trim();
}

/** Extract the first Meet URL from a string */
function extractMeetUrl(raw: string): string | null {
  const match = MEET_URL_REGEX.exec(raw);
  MEET_URL_REGEX.lastIndex = 0;
  return match?.[0] ?? null;
}

/** Parse raw osascript output into MeetingEvent[] */
function parseEvents(raw: string): MeetingEvent[] {
  if (!raw) return [];

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line): MeetingEvent[] => {
      const parts = line.split('||');
      if (parts.length < 7) return [];

      const [id, title, startStr, endStr, urlField, calendarName, allDayStr] = parts as [
        string, string, string, string, string, string, string
      ];

      const rawUrl = urlField.startsWith('NOTES:') ? urlField.slice(6) : urlField;
      const meetUrl = extractMeetUrl(rawUrl);
      if (!meetUrl) return [];

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

      return [
        {
          id: id.trim(),
          title: title.trim(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          meetUrl,
          calendarName: calendarName.trim(),
          isAllDay: allDayStr.trim() === 'true',
        },
      ];
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

/** Fetch Google Meet events from Apple Calendar */
export async function getCalendarEvents(): Promise<MeetingEvent[]> {
  try {
    const output = await runAppleScript(GET_EVENTS_SCRIPT);
    return parseEvents(output);
  } catch (err) {
    console.error('[calendar] getCalendarEvents error:', err);
    return [];
  }
}

/** Trigger permission dialog by accessing Calendar — returns status */
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
