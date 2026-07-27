import type { EventId } from "../../../domain/entities/brand.js";
import type { CalendarResult } from "../../../domain/entities/calendar-result.js";

/**
 * Narrow scheduler surface for join hub and watchers.
 * Full start/stop/restart remain on scheduler/facade.
 */
export interface SchedulerPort {
  getLastKnownEvents(): CalendarResult | null;
  cancelPendingBrowserOpen(id: EventId): void;
  forcePoll(): Promise<void>;
}
