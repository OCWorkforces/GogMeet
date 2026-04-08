import type { MeetingEvent } from "../../shared/models.js";

/** Strip Outlook/Exchange HTML-to-plaintext border artifacts from event notes. */
export function cleanDescription(notes: string): string {
  return notes
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      // Outlook text-border: -::~:~::~:~:...:~::-
      if (/^[-~:]+$/.test(trimmed) && trimmed.length > 10) return false;

      // Long separator lines (underscores, dashes, asterisks)
      if (/^[_\-\*]{5,}$/.test(trimmed)) return false;

      // Outlook bordered separators: * ___ * or similar
      if (/^[\*_][\s_\-\*]+[\*_]$/.test(trimmed)) return false;

      return true;
    })
    .join("\n")
    .trim();
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
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line): MeetingEvent[] => {
      const parts = line.split("\t");
      if (parts.length < 7) return [];

      const [
        id,
        title,
        startStr,
        endStr,
        urlField,
        calendarName,
        allDayStr,
        emailField,
        notesField,
      ] = parts as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string | undefined,
        string | undefined,
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
          isAllDay: allDayStr.trim() === "true",
          ...(emailField?.trim() ? { userEmail: emailField.trim() } : {}),
          ...(notesField?.trim()
            ? { description: cleanDescription(notesField) }
            : {}),
        },
      ];
    })
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
}
