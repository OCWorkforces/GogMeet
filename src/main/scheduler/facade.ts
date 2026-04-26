// scheduler/facade.ts — single entry point for external consumers
export {
  poll,
  forcePoll,
  startScheduler,
  stopScheduler,
  restartScheduler,
  _resetForTest,
} from "./poll.js";

export {
  scheduleEvents,
  setSchedulerWindow,
  setTrayTitleCallback,
} from "./index.js";

export { initPowerCallbacks, getLastKnownEvents } from "./state.js";
