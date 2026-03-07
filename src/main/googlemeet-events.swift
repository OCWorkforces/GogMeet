import EventKit
import Foundation

// GoogleMeet Swift EventKit Helper
// Outputs Google Meet events for today+tomorrow in pipe-delimited format:
// uid||title||startISO||endISO||meetUrl||calendarName||isAllDay||userEmail
//
// Each line is one event. Exit 0 on success, exit 1 on permission denied.

let store = EKEventStore()
let sema = DispatchSemaphore(value: 0)

store.requestFullAccessToEvents { granted, _ in
  guard granted else {
    fputs("error: calendar access denied\n", stderr)
    exit(1)
  }

  let cal = Calendar.current
  var startComps = cal.dateComponents([.year, .month, .day], from: Date())
  startComps.hour = 0; startComps.minute = 0; startComps.second = 0
  guard let startDate = cal.date(from: startComps),
        let endDate = cal.date(byAdding: .day, value: 2, to: startDate) else {
    fputs("error: could not compute date range\n", stderr)
    exit(1)
  }

  let pred = store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
  let events = store.events(matching: pred)

  let meetRegex = try! NSRegularExpression(
    pattern: #"https://meet\.google\.com/[^\s"'<>\\]+"#
  )
  let isoFormatter = ISO8601DateFormatter()

  func findMeetUrl(_ text: String?) -> String? {
    guard let t = text else { return nil }
    let range = NSRange(t.startIndex..., in: t)
    guard let match = meetRegex.firstMatch(in: t, range: range) else { return nil }
    return String(t[Range(match.range, in: t)!])
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

    print("\(uid)\t\(title)\t\(start)\t\(end)\t\(url)\t\(calName)\t\(allDay)\t\(userEmail)")
  }

  sema.signal()
}

sema.wait()
