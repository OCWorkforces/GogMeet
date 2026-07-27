import type { EventId } from "../../../domain/entities/brand.js";

export interface DisplayState {
  activeTitleEventId: EventId | null;
  activeInMeetingEventId: EventId | null;
  titleDirty: boolean;
  inMeetingDirty: boolean;
}

export function createDisplayState(): DisplayState {
  return {
    activeTitleEventId: null,
    activeInMeetingEventId: null,
    titleDirty: false,
    inMeetingDirty: false,
  };
}
