import type { BrowserWindow } from "electron";

export interface PowerCallbacks {
  getPollInterval: () => number;
  preventSleep: () => void;
  allowSleep: () => void;
}

export interface RuntimeState {
  win: BrowserWindow | null;
  onTrayTitleUpdate?:
    | ((title: string | null, minsRemaining?: number, inMeeting?: boolean) => void)
    | null;
  powerCallbacks?: PowerCallbacks | null;
}

export function createRuntimeState(): RuntimeState {
  return {
    win: null,
    onTrayTitleUpdate: null,
    powerCallbacks: null,
  };
}
