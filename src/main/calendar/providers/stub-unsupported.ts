import type {
  CalendarPermission,
  CalendarResult,
} from "../../../domain/entities/calendar-result.js";
import { formatAppError } from "../../../domain/entities/errors.js";
import type { CalendarProvider } from "../provider.js";

const UNSUPPORTED_MESSAGE =
  "Calendar is not available on this platform yet. Google Calendar support is coming in a future update.";

/**
 * Placeholder provider for platforms without a wired calendar backend.
 * Windows uses the Google Calendar provider in production; this stub is residual.
 */
export function createStubUnsupportedProvider(): CalendarProvider {
  return {
    id: "stub-unsupported",
    async getEvents(_signal: AbortSignal): Promise<CalendarResult> {
      return {
        kind: "err",
        error: formatAppError({
          kind: "calendar-runtime",
          message: UNSUPPORTED_MESSAGE,
        }),
        code: "runtime",
      };
    },
    async getPermissionStatus(): Promise<CalendarPermission> {
      // Not "not-determined" — lifecycle must not auto-prompt OAuth/OS dialogs.
      return "denied";
    },
    async requestPermission(): Promise<CalendarPermission> {
      return "denied";
    },
  };
}
