import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const describeMac = process.platform === "darwin" ? describe : describe.skip;

import { verifyReleaseArtifacts } from "../../scripts/macos-release-verifier-native.mjs";

type ReleaseArtifact = {
  readonly arch: "arm64" | "x64";
  readonly format: "dmg" | "zip";
  readonly name: string;
};

type CommandResult = {
  readonly signal: null;
  readonly status: number;
  readonly stderr: string;
  readonly stdout: string;
};

const SOURCE = "fixture Swift source";
const ARTIFACTS: readonly ReleaseArtifact[] = [
  { arch: "arm64", format: "dmg", name: "GogMeet-1.15.5-arm64.dmg" },
  { arch: "arm64", format: "zip", name: "GogMeet-1.15.5-arm64.zip" },
  { arch: "x64", format: "dmg", name: "GogMeet-1.15.5-x64.dmg" },
  { arch: "x64", format: "zip", name: "GogMeet-1.15.5-x64.zip" },
];
const SIGNING_DISPLAY = [
  "Identifier=com.ocworkforces.gogmeet",
  "CodeDirectory v=20500 flags=0x10000(runtime) hashes=123",
  "Authority=Developer ID Application: iWorkforces (ABCDE12345)",
].join("\n");
const ENTITLEMENTS = "<plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>";

type CommandCall = {
  readonly args: readonly string[];
  readonly command: string;
};

const success = (stdout = ""): CommandResult => ({ signal: null, status: 0, stderr: "", stdout });

async function createApp(root: string): Promise<void> {
  const appPath = join(root, "GogMeet.app");
  await mkdir(join(appPath, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(appPath, "Contents", "Resources", "app.asar.unpacked", "src", "main"), {
    recursive: true,
  });
  await writeFile(join(appPath, "Contents", "MacOS", "GogMeet"), "fixture executable");
  await writeFile(
    join(appPath, "Contents", "Resources", "app.asar.unpacked", "src", "main", "googlemeet-events.swift"),
    SOURCE,
  );
}

describeMac("verifyReleaseArtifacts", () => {
  it("verifies both DMGs before attaching while preserving fixture ownership", async () => {
    // Given
    const fixtureRoot = await mkdtemp(join(tmpdir(), "gogmeet-dmg-verify-test-"));
    const distDir = join(fixtureRoot, "dist");
    const sentinelPath = join(fixtureRoot, "sentinel");
    const previousVerifierDirs = new Set(
      (await readdir(tmpdir())).filter((entry) => entry.startsWith("gogmeet-release-verify-")),
    );
    const calls: CommandCall[] = [];
    await mkdir(distDir);
    await Promise.all(ARTIFACTS.map((artifact) => writeFile(join(distDir, artifact.name), "fixture container")));
    await writeFile(sentinelPath, "preserve me");

    const run = async (
      command: string,
      args: readonly string[],
      _options?: { readonly env?: NodeJS.ProcessEnv; readonly timeoutMs?: number },
    ): Promise<CommandResult> => {
      calls.push({ args, command });
      if (command === "hdiutil" && args[0] === "attach") {
        const mountDir = args.at(-1);
        if (mountDir === undefined) throw new Error("missing fake mount directory");
        await createApp(mountDir);
      }
      if (command === "ditto") {
        const targetDir = args.at(-1);
        if (targetDir === undefined) throw new Error("missing fake extraction directory");
        await createApp(targetDir);
      }
      if (command === "codesign" && args[0] === "-dvv") return success(SIGNING_DISPLAY);
      if (command === "codesign" && args[1] === "--entitlements") return success(ENTITLEMENTS);
      if (command === "lipo") return success(args[1]?.includes("arm64") ? "arm64" : "x64");
      if (command.endsWith("googlemeet-events")) return { ...success(), status: 2 };
      return success();
    };
    const launch = (_appPath: string, isolatedTmp: string) => {
      const cacheDir = join(isolatedTmp, "googlemeet");
      mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      chmodSync(cacheDir, 0o700);
      const helperPath = join(cacheDir, "googlemeet-events");
      writeFileSync(helperPath, "fixture helper");
      chmodSync(helperPath, 0o700);
      writeFileSync(
        join(cacheDir, "source.hash"),
        createHash("sha256").update(SOURCE).digest("hex"),
      );
      return { exit: Promise.resolve(), pid: 2_147_483_647 };
    };

    // When
    try {
      await verifyReleaseArtifacts({
        artifacts: ARTIFACTS,
        distDir,
        launch,
        nativeArchitecture: "arm64",
        run,
      });

      // Then
      for (const artifact of ARTIFACTS.filter((entry) => entry.format === "dmg")) {
        const artifactPath = join(distDir, artifact.name);
        const verifyIndex = calls.findIndex(
          (call) => call.command === "hdiutil" && call.args[0] === "verify" && call.args[1] === artifactPath,
        );
        const attachIndex = calls.findIndex(
          (call) => call.command === "hdiutil" && call.args[0] === "attach" && call.args[1] === artifactPath,
        );
        expect(verifyIndex).toBeGreaterThanOrEqual(0);
        expect(verifyIndex).toBeLessThan(attachIndex);
        expect(calls[attachIndex]?.args).not.toContain("-noverify");
      }
      expect(calls.filter((call) => call.command === "codesign" && call.args[0] === "--verify")).toHaveLength(4);
      expect(calls.filter((call) => call.command === "xcrun")).toHaveLength(4);
      expect(await readFile(sentinelPath, "utf8")).toBe("preserve me");
      const remainingVerifierDirs = (await readdir(tmpdir())).filter(
        (entry) => entry.startsWith("gogmeet-release-verify-") && !previousVerifierDirs.has(entry),
      );
      expect(remainingVerifierDirs).toEqual([]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
    await expect(stat(fixtureRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
