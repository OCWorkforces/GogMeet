import EventKit
import Foundation

// GoogleMeet Swift EventKit Helper
// Outputs Google Meet events for today+tomorrow in tab-delimited format:
// uid\ttitle\tstartISO\tendISO\tmeetUrl\tcalendarName\tisAllDay\tuserEmail\tnotes
//
// Structured exit codes (consumed by event-parser.ts via err.code):
//   0 — success
//   2 — calendar permission denied
//   3 — no calendars found / nothing to query
//   4 — other error (date range, regex compile, etc.)

let store = EKEventStore()
let sema = DispatchSemaphore(value: 0)

// Request calendar access with backward compatibility
// macOS 14+ uses requestFullAccessToEvents, older versions use requestAccess(to: .event)
func requestCalendarAccess(completion: @escaping (Bool) -> Void) {
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { granted, _ in
            completion(granted)
        }
    } else {
        store.requestAccess(to: .event) { granted, _ in
            completion(granted)
        }
    }
}

// Always signal the semaphore before exiting so the run loop never hangs
// if exit() is intercepted (e.g. by a test harness or signal handler).
func fail(_ message: String, code: Int32) -> Never {
    fputs("error: \(message)\n", stderr)
    sema.signal()
    exit(code)
}

requestCalendarAccess { granted in
    guard granted else {
        fail("calendar access denied", code: 2)
    }

    let cal = Calendar.current
    var startComps = cal.dateComponents([.year, .month, .day], from: Date())
    startComps.hour = 0; startComps.minute = 0; startComps.second = 0
    guard let startDate = cal.date(from: startComps),
          let endDate = cal.date(byAdding: .day, value: 2, to: startDate) else {
        fail("could not compute date range", code: 4)
    }

    let pred = store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
    let availableCalendars = store.calendars(for: .event)
    if availableCalendars.isEmpty {
        fail("no calendars available", code: 3)
    }
    let events = store.events(matching: pred)

    guard let meetRegex = try? NSRegularExpression(
        pattern: #"https://meet\.google\.com/[^\s"'<>\\]+"#
    ) else {
        fail("could not compile meet URL regex", code: 4)
    }
    let isoFormatter = ISO8601DateFormatter()

    func findMeetUrl(_ text: String?) -> String? {
        guard let t = text else { return nil }
        let range = NSRange(t.startIndex..., in: t)
        guard let match = meetRegex.firstMatch(in: t, range: range) else { return nil }
        guard let matchRange = Range(match.range, in: t) else { return nil }
        return String(t[matchRange])
    }

    for event in events {
        if event.status == .canceled { continue }
        // Skip events the user has declined
        if let attendees = event.attendees,
           let self_ = attendees.first(where: { $0.isCurrentUser }),
           self_.participantStatus == .declined {
            continue
        }
        let url = findMeetUrl(event.url?.absoluteString) ?? findMeetUrl(event.location) ?? findMeetUrl(event.notes) ?? ""

        let uid = event.calendarItemIdentifier
        let title = event.title ?? ""
        let start = isoFormatter.string(from: event.startDate)
        let end = isoFormatter.string(from: event.endDate)
        let calName = event.calendar?.title ?? ""
        let allDay = event.isAllDay ? "true" : "false"

        // Extract user's Google email from attendees (self attendee)
        var userEmail = ""
        if let attendees = event.attendees {
            for attendee in attendees {
                if attendee.isCurrentUser {
                    let raw = attendee.url.absoluteString
                    if raw.hasPrefix("mailto:") {
                        userEmail = String(raw.dropFirst(7))
                    }
                    break
                }
            }
        }

        print("\(uid)\t\(title)\t\(start)\t\(end)\t\(url)\t\(calName)\t\(allDay)\t\(userEmail)\t\(event.notes ?? "")")
    }

    sema.signal()
}

sema.wait()
