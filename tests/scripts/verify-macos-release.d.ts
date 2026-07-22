declare module "*/scripts/verify-macos-release.mjs" {
  export type ReleaseArtifact = {
    readonly arch: "arm64" | "x64";
    readonly format: "dmg" | "zip";
    readonly name: string;
  };

  export function inventoryReleaseArtifacts(
    entries: readonly string[],
    packageInfo: { readonly productName: string; readonly version: string },
  ): readonly ReleaseArtifact[];

  export function assertCodesignDisplay(display: string, bundleId: string): void;
  export function assertEntitlements(entitlements: string): void;
  export function assertSwiftHelperResult(result: {
    readonly status: number | null;
    readonly stdout: string;
  }): void;
}
