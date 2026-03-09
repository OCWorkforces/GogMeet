const PREFIX_MAP = {
  scheduler: "[scheduler]",
  calendar: "[calendar]",
  main: "[main]",
  ipc: "[ipc]",
} as const;

export function createLogger(scope: keyof typeof PREFIX_MAP) {
  const prefix = PREFIX_MAP[scope];
  return {
    info: (...args: unknown[]) => console.log(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
  };
}

export type Logger = ReturnType<typeof createLogger>;
