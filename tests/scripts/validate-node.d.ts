declare module "*/scripts/validate-node.mjs" {
  export const REQUIRED_MAJOR: number;
  export function parseMajor(version: string): number;
  export function validateNodeVersion(
    version: string,
    requiredMajor?: number,
  ):
    | { ok: true; major: number }
    | { ok: false; error: string };
  export function defaultGeneratorPath(): string;
  export function runValidation(options?: {
    version?: string;
    env?: Record<string, string | undefined>;
    spawn?: (
      cmd: string,
      args: ReadonlyArray<string>,
      options: { stdio: "inherit" },
    ) => {
      status?: number | null;
      signal?: NodeJS.Signals | null;
      error?: Error;
    };
    nodeExecPath?: string;
    generatorPath?: string;
    logger?: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  }): number;
}
