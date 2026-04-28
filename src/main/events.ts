// events.ts — typed event bus for cross-subsystem decoupling.
//
// Goal: allow modules (e.g. tray) to react to scheduler/power changes without
// importing those modules directly. Publishers (scheduler, power) emit events;
// subscribers (tray) listen. This removes direct module dependencies (DSM edges)
// while keeping behavior identical.
import { EventEmitter } from "node:events";

import type { MeetingEvent } from "../shared/models.js";

/**
 * Strongly-typed event map for the main-process event bus.
 *
 * Each key is an event name; the value is the tuple of arguments
 * passed to listeners (matches Node's `EventEmitter` listener signature).
 */
export interface MainEvents {
  /** Fired after a successful calendar poll with the freshly fetched events. */
  "meeting-list-updated": [events: MeetingEvent[]];
  /** Fired when macOS power state transitions between AC and battery. */
  "power-state-changed": [payload: { onAC: boolean }];
}

/**
 * Typed wrapper around Node's EventEmitter constrained to {@link MainEvents}.
 *
 * Using a thin subclass (instead of declaration merging) keeps the type
 * surface narrow and prevents accidental use of arbitrary string events.
 */
export class TypedMainEventBus extends EventEmitter {
  override emit<E extends keyof MainEvents>(event: E, ...args: MainEvents[E]): boolean {
    return super.emit(event, ...args);
  }

  override on<E extends keyof MainEvents>(
    event: E,
    listener: (...args: MainEvents[E]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<E extends keyof MainEvents>(
    event: E,
    listener: (...args: MainEvents[E]) => void,
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override once<E extends keyof MainEvents>(
    event: E,
    listener: (...args: MainEvents[E]) => void,
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }
}

/**
 * Singleton event bus shared by all main-process subsystems.
 *
 * Import from `./events.js` (ESM source → CJS output convention).
 */
export const mainBus: TypedMainEventBus = new TypedMainEventBus();
