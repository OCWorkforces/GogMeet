import { describe, expect, it } from "vitest";

import {
  assertCodesignDisplay,
  assertEntitlements,
  assertSwiftHelperResult,
  inventoryReleaseArtifacts,
} from "../../scripts/verify-macos-release.mjs";

const PACKAGE_INFO = {
  productName: "GogMeet",
  version: "1.15.5",
};

describe("inventoryReleaseArtifacts", () => {
  it("returns the exact arm64 and x64 DMG and ZIP containers", () => {
    // Given
    const entries = [
      "GogMeet-1.15.5-arm64.dmg",
      "GogMeet-1.15.5-arm64.zip",
      "GogMeet-1.15.5-x64.dmg",
      "GogMeet-1.15.5-x64.zip",
      "SHA256SUMS.txt",
    ];

    // When
    const artifacts = inventoryReleaseArtifacts(entries, PACKAGE_INFO);

    // Then
    expect(artifacts).toEqual([
      { arch: "arm64", format: "dmg", name: "GogMeet-1.15.5-arm64.dmg" },
      { arch: "arm64", format: "zip", name: "GogMeet-1.15.5-arm64.zip" },
      { arch: "x64", format: "dmg", name: "GogMeet-1.15.5-x64.dmg" },
      { arch: "x64", format: "zip", name: "GogMeet-1.15.5-x64.zip" },
    ]);
  });

  it("rejects a missing release container", () => {
    // Given
    const entries = [
      "GogMeet-1.15.5-arm64.dmg",
      "GogMeet-1.15.5-arm64.zip",
      "GogMeet-1.15.5-x64.dmg",
    ];

    // When / Then
    expect(() => inventoryReleaseArtifacts(entries, PACKAGE_INFO)).toThrow(
      /Missing release artifact: GogMeet-1.15.5-x64.zip/,
    );
  });
});

describe("assertCodesignDisplay", () => {
  it("accepts Developer ID metadata with the hardened runtime flag", () => {
    // Given
    const display = [
      "Identifier=com.ocworkforces.gogmeet",
      "CodeDirectory v=20500 flags=0x10000(runtime) hashes=123",
      "Authority=Developer ID Application: OCWorkforces (ABCDE12345)",
      "Authority=Developer ID Certification Authority",
      "Authority=Apple Root CA",
    ].join("\n");

    // When / Then
    expect(() => assertCodesignDisplay(display, "com.ocworkforces.gogmeet")).not.toThrow();
  });

  it("rejects a signature without the runtime flag", () => {
    // Given
    const display = [
      "Identifier=com.ocworkforces.gogmeet",
      "CodeDirectory v=20500 flags=0x0(none) hashes=123",
      "Authority=Developer ID Application: OCWorkforces (ABCDE12345)",
    ].join("\n");

    // When / Then
    expect(() => assertCodesignDisplay(display, "com.ocworkforces.gogmeet")).toThrow(
      /hardened runtime/,
    );
  });
});

describe("assertEntitlements", () => {
  it("requires JIT and rejects weakened executable-memory entitlements", () => {
    // Given
    const entitlements = [
      "<plist><dict>",
      "<key>com.apple.security.cs.allow-jit</key><true/>",
      "<key>com.apple.security.personal-information.calendars</key><true/>",
      "</dict></plist>",
    ].join("");

    // When / Then
    expect(() => assertEntitlements(entitlements)).not.toThrow();
    expect(() =>
      assertEntitlements(
        `${entitlements}<key>com.apple.security.cs.disable-library-validation</key><true/>`,
      ),
    ).toThrow(/forbidden entitlement/);
  });
});

describe("assertSwiftHelperResult", () => {
  it("accepts documented permission-denied exits", () => {
    // Given
    const result = { status: 2, stdout: "" };

    // When / Then
    expect(() => assertSwiftHelperResult(result)).not.toThrow();
  });

  it("rejects success output that is not nine strings per JSON line", () => {
    // Given
    const result = { status: 0, stdout: '["one", "two"]' };

    // When / Then
    expect(() => assertSwiftHelperResult(result)).toThrow(/nine strings/);
  });
});
