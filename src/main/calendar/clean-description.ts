/**
 * Pure description cleaning for calendar event notes.
 * Shared by EventKit (Swift) parse path and future cloud providers.
 */

const HTML_TAG_RE = /<[^>]*>/g;
const OUTLOOK_BORDER_RE = /^[-~:]+$/;
const LONG_SEPARATOR_RE = /^[_\-*]{5,}$/;
const OUTLOOK_BORDERED_RE = /^[*_][\s_\-*]+[*_]$/;

/** Strip HTML tags from event notes. CalDAV-synced events (e.g. Google Calendar
 *  via macOS Calendar) may contain raw HTML like `<a href="...">link</a>` in the notes field.
 *  EventKit returns this verbatim; stripping ensures downstream consumers see plain text. */
function stripHtmlTags(text: string): string {
  return text.replace(HTML_TAG_RE, "");
}

/** Strip Outlook/Exchange HTML-to-plaintext border artifacts from event notes,
 *  and remove any HTML tags present in CalDAV-synced event descriptions. */
export function cleanDescription(notes: string): string {
  return stripHtmlTags(notes)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      // Outlook text-border: -::~:~::~:~:...:~::-
      if (OUTLOOK_BORDER_RE.test(trimmed) && trimmed.length > 10) return false;

      // Long separator lines (underscores, dashes, asterisks)
      if (LONG_SEPARATOR_RE.test(trimmed)) return false;

      // Outlook bordered separators: * ___ * or similar
      if (OUTLOOK_BORDERED_RE.test(trimmed)) return false;

      return true;
    })
    .join("\n")
    .trim();
}
