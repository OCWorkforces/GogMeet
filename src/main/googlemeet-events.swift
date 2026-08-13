import EventKit
import Foundation

// GogMeet Swift EventKit Helper
//
// Two modes:
//   1. One-shot (default): outputs one JSON array line per meeting event for today+tomorrow
//      [uid, title, startISO, endISO, meetUrl, calendarName, isAllDay, userEmail, notes]
//   2. Watch mode (--watch): runs indefinitely, prints `CHANGED` to stdout whenever
//      EKEventStore broadcasts a change notification (debounced 1000ms). Exits cleanly
//      when stdin closes (parent process death).
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

// MARK: - Watch mode
// When invoked with --watch, register for EKEventStoreChanged notifications and emit
// `CHANGED` on stdout (debounced). The Node.js side handles the actual event fetch via
// its regular poll — we only signal that *something* changed.
if CommandLine.arguments.contains("--watch") {
    requestCalendarAccess { granted in
        guard granted else {
            fputs("error: calendar access denied\n", stderr)
            exit(2)
        }
    }

    // Debounce state — coalesce rapid consecutive change notifications into one emit.
    let debounceMs: Int = 1000
    var pendingEmit: DispatchWorkItem?

    let observer = NotificationCenter.default.addObserver(
        forName: .EKEventStoreChanged,
        object: store,
        queue: .main
    ) { _ in
        pendingEmit?.cancel()
        let work = DispatchWorkItem {
            print("CHANGED")
            fflush(__stdoutp)
        }
        pendingEmit = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(debounceMs), execute: work)
    }
    _ = observer  // retain

    // Detect parent process death via stdin EOF.
    FileHandle.standardInput.readabilityHandler = { handle in
        let data = handle.availableData
        if data.count == 0 {
            exit(0)
        }
    }

    RunLoop.main.run()
    exit(0)
}

// MARK: - One-shot mode (default)

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
    guard let calendlyRegex = try? NSRegularExpression(
        pattern: #"https://calendly\.com/[^\s"'<>\\]+"#
    ) else {
        fail("could not compile calendly URL regex", code: 4)
    }
    guard let zoomRegex = try? NSRegularExpression(
        pattern: #"https://(?:[a-zA-Z0-9-]+\.)*zoom\.us/[^\s"'<>\\]+"#
    ) else {
        fail("could not compile zoom URL regex", code: 4)
    }
    let isoFormatter = ISO8601DateFormatter()

    func findMeetUrl(_ text: String?) -> String? {
        guard let t = text else { return nil }
        let nsRange = NSRange(t.startIndex..., in: t)
        // Try Zoom first, then Meet, then Calendly (wrapper solves to Meet via 302)
        if let match = zoomRegex.firstMatch(in: t, range: nsRange),
           let matchRange = Range(match.range, in: t) {
            return String(t[matchRange])
        }
        if let match = meetRegex.firstMatch(in: t, range: nsRange),
           let matchRange = Range(match.range, in: t) {
            return String(t[matchRange])
        }
        if let match = calendlyRegex.firstMatch(in: t, range: nsRange),
           let matchRange = Range(match.range, in: t) {
            return String(t[matchRange])
        }
        return nil
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

        let uid = eventRecordIdentifier(
            calendarItemIdentifier: event.calendarItemIdentifier,
            occurrenceDate: event.occurrenceDate,
            startDate: event.startDate
        )
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

        let fields = [uid, title, start, end, url, calName, allDay, userEmail, event.notes ?? ""]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: fields),
              let jsonLine = String(data: jsonData, encoding: .utf8) else {
            fail("could not serialize event", code: 4)
        }
        print(jsonLine)
    }

    sema.signal()
}

sema.wait()
