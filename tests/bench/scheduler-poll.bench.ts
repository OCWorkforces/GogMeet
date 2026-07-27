import { bench, describe } from "vitest";
import { eventListSignature } from "../../src/domain/services/event-signature.js";
import {
  asTestEventId,
  asTestIsoUtc,
  createMockEvent,
  isoFromNow,
} from "../helpers/test-utils.js";

const EVENT_COUNT = 20;

const events = Array.from({ length: EVENT_COUNT }, (_, index) =>
  createMockEvent({
    id: asTestEventId(`scheduler-event-${index}`),
    title: `Scheduler Meeting ${index}`,
    startDate: asTestIsoUtc(isoFromNow(10 + index)),
    endDate: asTestIsoUtc(isoFromNow(40 + index)),
    calendarName: index % 2 === 0 ? "Engineering" : "Product",
  }),
);

describe("scheduler poll signature benchmark", () => {
  bench("eventListSignature/20 events", () => {
    eventListSignature(events);
  });
});
