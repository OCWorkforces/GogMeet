export class ReleaseVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseVerificationError";
  }
}

const ARCHITECTURES = ["arm64", "x64"];
const FORMATS = ["dmg", "zip"];
const FORBIDDEN_ENTITLEMENTS = [
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
];

function expectedArtifactName(packageInfo, architecture, format) {
  return `${packageInfo.productName}-${packageInfo.version}-${architecture}.${format}`;
}

export function inventoryReleaseArtifacts(entries, packageInfo) {
  const containers = entries.filter((entry) => entry.endsWith(".dmg") || entry.endsWith(".zip"));
  const expected = ARCHITECTURES.flatMap((architecture) =>
    FORMATS.map((format) => ({
      arch: architecture,
      format,
      name: expectedArtifactName(packageInfo, architecture, format),
    })),
  );
  const expectedNames = new Set(expected.map((artifact) => artifact.name));
  for (const container of containers) {
    if (!expectedNames.has(container)) {
      throw new ReleaseVerificationError(`Unexpected macOS release artifact: ${container}`);
    }
  }
  for (const artifact of expected) {
    const matches = containers.filter((container) => container === artifact.name);
    if (matches.length === 0) {
      throw new ReleaseVerificationError(`Missing release artifact: ${artifact.name}`);
    }
    if (matches.length !== 1) {
      throw new ReleaseVerificationError(`Duplicate release artifact: ${artifact.name}`);
    }
  }
  return expected;
}

export function assertCodesignDisplay(display, bundleId) {
  if (!new RegExp(`^Identifier=${escapeRegex(bundleId)}$`, "m").test(display)) {
    throw new ReleaseVerificationError(`Unexpected bundle identifier; expected ${bundleId}`);
  }
  if (!/^Authority=Developer ID Application:/m.test(display)) {
    throw new ReleaseVerificationError("Code signature is not authorized by a Developer ID Application certificate");
  }
  if (!/^CodeDirectory .*\bruntime\b/m.test(display)) {
    throw new ReleaseVerificationError("Code signature is missing the hardened runtime flag");
  }
}

export function assertEntitlements(entitlements) {
  if (!new RegExp("<key>com\\.apple\\.security\\.cs\\.allow-jit</key>\\s*<true\\s*/>").test(entitlements)) {
    throw new ReleaseVerificationError("Missing required com.apple.security.cs.allow-jit entitlement");
  }
  for (const entitlement of FORBIDDEN_ENTITLEMENTS) {
    if (entitlements.includes(`<key>${entitlement}</key>`)) {
      throw new ReleaseVerificationError(`Found forbidden entitlement: ${entitlement}`);
    }
  }
}

export function assertMainArchitecture(lipoOutput, expectedArchitecture) {
  const architectures = lipoOutput.trim().split(/\s+/u).filter(Boolean);
  if (architectures.length !== 1 || architectures[0] !== expectedArchitecture) {
    throw new ReleaseVerificationError(
      `Main executable architecture must be ${expectedArchitecture}, found ${architectures.join(", ") || "none"}`,
    );
  }
}

export function assertSwiftHelperResult(result) {
  if (result.status !== 0 && result.status !== 2 && result.status !== 3) {
    throw new ReleaseVerificationError(`Swift helper exited with undocumented status ${String(result.status)}`);
  }
  if (result.status !== 0 || result.stdout.trim() === "") return;
  for (const line of result.stdout.trim().split("\n")) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ReleaseVerificationError(`Swift helper emitted invalid JSON: ${message}`);
    }
    if (!Array.isArray(record) || record.length !== 9 || !record.every((field) => typeof field === "string")) {
      throw new ReleaseVerificationError("Swift helper success output must contain JSON arrays of exactly nine strings");
    }
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
