import Foundation

public func eventRecordIdentifier(
    calendarItemIdentifier: String,
    occurrenceDate: Date?,
    startDate: Date
) -> String {
    let timestamp = (occurrenceDate ?? startDate).timeIntervalSince1970.bitPattern
    return "\(calendarItemIdentifier):\(timestamp)"
}
