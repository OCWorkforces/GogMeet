export function collectNsisArtifacts(
  version: string,
  dir?: string,
): { path: string; arch: "x64" | "arm64"; sha512: string; size: number }[];

export function buildLatestYml(
  version: string,
  files: { path: string; arch: string; sha512: string; size: number }[],
): string;

export function mergeWindowsLatestYml(opts?: {
  distDir?: string;
  version?: string;
}): {
  outPath: string;
  version: string;
  files: { path: string; arch: string; sha512: string; size: number }[];
  yml: string;
};
