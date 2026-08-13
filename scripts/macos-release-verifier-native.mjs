import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findOnlyApp } from "./macos-release-verifier-container.mjs";
import {
  ReleaseVerificationError,
  assertCodesignDisplay,
  assertEntitlements,
  assertMainArchitecture,
  assertSwiftHelperResult,
} from "./macos-release-verifier-helpers.mjs";

const BUNDLE_ID = "com.ocworkforces.gogmeet";
/** Unpacked EventKit helper — must match `resolveSwiftSourcePath` packaged layout. */
const APP_EVENT_SOURCE_PATH = [
  "Contents",
  "Resources",
  "app.asar.unpacked",
  "src",
  "main",
  "googlemeet-events.swift",
];
/** Unpacked occurrence-identity helper — must match `resolveSwiftOccurrenceIdentitySourcePath`. */
const APP_IDENTITY_SOURCE_PATH = [
  "Contents",
  "Resources",
  "app.asar.unpacked",
  "src",
  "main",
  "swift",
  "event-occurrence-identity.swift",
];
const CACHE_WAIT_MS = 60_000;

export function createCommandRunner(spawnProcess = spawn) {
  return (command, args, options = {}) =>
    new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnProcess(command, args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        reject(error);
        return;
      }
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new ReleaseVerificationError(`${command} timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs ?? 30_000);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (status, signal) => {
        clearTimeout(timer);
        resolve({ status, signal, stdout, stderr });
      });
    });
}

export async function verifyReleaseArtifacts(options) {
  const run = options.run ?? createCommandRunner();
  const launch = options.launch ?? launchApp;
  const nativeArchitecture = options.nativeArchitecture ?? process.arch;
  const workDir = await mkdtemp(join(tmpdir(), "gogmeet-release-verify-"));
  let ranNativeSmoke = false;
  try {
    for (const artifact of options.artifacts) {
      const artifactPath = join(options.distDir, artifact.name);
      const containerDir = join(workDir, `${artifact.arch}-${artifact.format}`);
      await mkdir(containerDir);
      if (artifact.format === "dmg") {
        await verifyDmg({ artifactPath, containerDir, artifact, run });
      } else {
        await requireSuccess(run("ditto", ["-x", "-k", artifactPath, containerDir]), "ditto");
        const appPath = await findOnlyApp(containerDir);
        await verifyApp({ appPath, arch: artifact.arch, run });
        if (artifact.arch === nativeArchitecture) {
          await smokeSwiftRuntime({ appPath, workDir, run, launch });
          ranNativeSmoke = true;
        }
      }
    }
    if (!ranNativeSmoke) {
      throw new ReleaseVerificationError(
        `No ZIP artifact matches the native ${nativeArchitecture} architecture for runtime smoke`,
      );
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function verifyDmg(options) {
  const mountDir = join(options.containerDir, "mounted");
  await mkdir(mountDir);
  await requireSuccess(options.run("hdiutil", ["verify", options.artifactPath]), "hdiutil verify");
  await requireSuccess(
    options.run("hdiutil", [
      "attach",
      options.artifactPath,
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountDir,
    ]),
    "hdiutil attach",
  );
  try {
    const appPath = await findOnlyApp(mountDir);
    await verifyApp({ appPath, arch: options.artifact.arch, run: options.run });
  } finally {
    await requireSuccess(options.run("hdiutil", ["detach", mountDir]), "hdiutil detach");
  }
}

async function verifyApp(options) {
  await requireSuccess(
    options.run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", options.appPath]),
    "codesign verify",
  );
  const display = await requireSuccess(
    options.run("codesign", ["-dvv", options.appPath]),
    "codesign display",
  );
  assertCodesignDisplay(`${display.stdout}\n${display.stderr}`, BUNDLE_ID);
  const entitlements = await requireSuccess(
    options.run("codesign", ["-d", "--entitlements", ":-", options.appPath]),
    "codesign entitlements",
  );
  assertEntitlements(`${entitlements.stdout}\n${entitlements.stderr}`);
  const mainExecutable = join(options.appPath, "Contents", "MacOS", "GogMeet");
  const lipo = await requireSuccess(options.run("lipo", ["-archs", mainExecutable]), "lipo");
  assertMainArchitecture(lipo.stdout, options.arch);
  await requireSuccess(
    options.run("spctl", ["--assess", "--type", "execute", "--verbose=4", options.appPath]),
    "spctl assess",
  );
  await requireSuccess(
    options.run("xcrun", ["stapler", "validate", options.appPath]),
    "xcrun stapler validate",
  );
  await requireSwiftSource(options.appPath);
}

async function requireSwiftSource(appPath) {
  for (const relativeParts of [APP_EVENT_SOURCE_PATH, APP_IDENTITY_SOURCE_PATH]) {
    const sourcePath = join(appPath, ...relativeParts);
    const sourceStats = await stat(sourcePath);
    if (!sourceStats.isFile()) {
      throw new ReleaseVerificationError(`Missing unpacked Swift source: ${sourcePath}`);
    }
  }
}

async function smokeSwiftRuntime(options) {
  const runtimeDir = await mkdtemp(join(options.workDir, "swift-runtime-"));
  const isolatedTmp = join(runtimeDir, "tmp");
  await mkdir(isolatedTmp);
  const appProcess = options.launch(options.appPath, isolatedTmp);
  try {
    const cacheDir = join(isolatedTmp, "googlemeet");
    const helperPath = join(cacheDir, "googlemeet-events");
    const hashPath = join(cacheDir, "source.hash");
    await waitForFiles([helperPath, hashPath], CACHE_WAIT_MS);
    await requireCachePermissions(cacheDir, helperPath);
    await requireSourceHash(options.appPath, hashPath);
    const result = await options.run(helperPath, [], {
      env: { ...process.env, TMPDIR: isolatedTmp },
      timeoutMs: 15_000,
    });
    assertSwiftHelperResult(result);
  } finally {
    await stopApp(appProcess);
    await rm(runtimeDir, { recursive: true, force: true });
  }
}

function launchApp(appPath, isolatedTmp) {
  const executable = join(appPath, "Contents", "MacOS", "GogMeet");
  const child = spawn(executable, [], {
    detached: true,
    env: { ...process.env, TMPDIR: isolatedTmp },
    stdio: "ignore",
  });
  if (child.pid === undefined) {
    throw new ReleaseVerificationError(`Unable to launch ${executable}`);
  }
  const exit = new Promise((resolve) => {
    child.once("close", () => resolve());
  });
  return { exit, pid: child.pid };
}

async function stopApp(appProcess) {
  try {
    process.kill(-appProcess.pid, "SIGTERM");
  } catch (error) {
    if (!isMissingProcess(error)) throw error;
  }
  const exited = await Promise.race([
    appProcess.exit.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!exited) {
    try {
      process.kill(-appProcess.pid, "SIGKILL");
    } catch (error) {
      if (!isMissingProcess(error)) throw error;
    }
  }
}

async function waitForFiles(paths, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await Promise.all(paths.map(fileExists)).then((results) => results.every(Boolean))) return;
    await delay(250);
  }
  throw new ReleaseVerificationError(
    `Timed out waiting for Swift helper cache: ${paths.join(", ")}`,
  );
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function requireCachePermissions(cacheDir, helperPath) {
  for (const path of [cacheDir, helperPath]) {
    const mode = (await stat(path)).mode & 0o777;
    if (mode !== 0o700) {
      throw new ReleaseVerificationError(`Swift cache path must use mode 0700: ${path}`);
    }
  }
}

/**
 * Digest both unpacked Swift sources in the same order/separator as runtime
 * `readSwiftSource` (identity + "\\n" + events) so `source.hash` matches.
 */
async function requireSourceHash(appPath, hashPath) {
  const identityPath = join(appPath, ...APP_IDENTITY_SOURCE_PATH);
  const eventPath = join(appPath, ...APP_EVENT_SOURCE_PATH);
  const [identitySource, eventSource] = await Promise.all([
    readFile(identityPath),
    readFile(eventPath),
  ]);
  const expected = createHash("sha256")
    .update(Buffer.concat([identitySource, Buffer.from("\n"), eventSource]))
    .digest("hex");
  const actual = (await readFile(hashPath, "utf8")).trim();
  if (actual !== expected) {
    throw new ReleaseVerificationError(
      "Swift helper source hash does not match the unpacked source",
    );
  }
}

async function requireSuccess(commandResult, label) {
  const result = await commandResult;
  if (result.status !== 0 || result.signal !== null) {
    throw new ReleaseVerificationError(
      `${label} failed: ${result.stderr.trim() || result.stdout.trim() || result.signal || result.status}`,
    );
  }
  return result;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isMissingFile(error) {
  return typeof error === "object" && error !== null && error["code"] === "ENOENT";
}

function isMissingProcess(error) {
  return typeof error === "object" && error !== null && error["code"] === "ESRCH";
}
