/**
 * after-pack.cjs — macOS binary optimizations
 *
 * This hook runs after Electron packages the app but before DMG creation.
 * It strips debug symbols and removes unused locale files to reduce app size.
 *
 * Runs for both ARM64 and x64 macOS builds.
 */
const { execSync } = require("node:child_process");
const { join } = require("node:path");
const { rm, readdir } = require("node:fs/promises");

// Arch enum from electron-builder: ia32=0, x64=1, armv7l=2, arm64=3, universal=4
const ARCH_ARM64 = 3;


  const archLabel =
    context.arch === ARCH_ARM64 || context.arch === "arm64"
      ? "ARM64"
      : "x64";

  const appOutDir = context.appOutDir;

  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);
  const frameworksDir = join(appPath, "Contents", "Frameworks");

  console.log(`\n[after-pack] ${archLabel} binary optimizations starting...`);

  // 1. Remove .DS_Store and AppleDouble files
  try {
    execSync(`find "${appPath}" -name ".DS_Store" -delete`, { stdio: "pipe" });
    execSync(`find "${appPath}" -name "._*" -delete`, { stdio: "pipe" });
    console.log("[after-pack] ✓ Removed .DS_Store and AppleDouble files");
  } catch {
    /* ignore */
  }

  // 2. Strip Electron Framework (biggest impact)
  // Note: Framework uses symlink structure, actual binary is in Versions/Current/
  const frameworkBinary = join(
    frameworksDir,
    "Electron Framework.framework",
    "Versions",
    "Current",
    "Electron Framework",
  );

  try {
    const sizeBefore = execSync(
      `du -sm "${frameworkBinary}" 2>/dev/null | cut -f1`,
      {
        encoding: "utf-8",
      },
    ).trim();

    execSync(`strip -x -S "${frameworkBinary}"`, { stdio: "pipe" });

    const sizeAfter = execSync(
      `du -sm "${frameworkBinary}" 2>/dev/null | cut -f1`,
      {
        encoding: "utf-8",
      },
    ).trim();

    console.log(
      `[after-pack] ✓ Stripped Electron Framework: ${sizeBefore}MB → ${sizeAfter}MB`,
    );
  } catch (e) {
    console.warn(
      "[after-pack] ⚠ Could not strip Electron Framework:",
      e.message,
    );
  }

  // 3. Strip helper apps
  const helpers = [
    "Electron Helper",
    "Electron Helper (Renderer)",
    "Electron Helper (GPU)",
    "Electron Helper (Plugin)",
  ];

  let strippedHelpers = 0;
  for (const helper of helpers) {
    const helperPath = join(
      frameworksDir,
      `${helper}.app`,
      "Contents",
      "MacOS",
      helper,
    );
    try {
      execSync(`strip -x -S "${helperPath}"`, { stdio: "pipe" });
      strippedHelpers++;
    } catch {
      /* Helper may not exist in this Electron version */
    }
  }

  if (strippedHelpers > 0) {
    console.log(`[after-pack] ✓ Stripped ${strippedHelpers} helper apps`);
  }

  // 4. Strip main executable
  const mainExe = join(appPath, "Contents", "MacOS", appName);
  try {
    execSync(`strip -x -S "${mainExe}"`, { stdio: "pipe" });
    console.log("[after-pack] ✓ Stripped main executable");
  } catch {
    /* ignore */
  }

  // 5. Remove unused locale files from Electron Framework
  const frameworkResourcesDir = join(
    frameworksDir,
    "Electron Framework.framework",
    "Versions",
    "Current",
    "Resources",
  );

  try {
    const entries = await readdir(frameworkResourcesDir);
    let removedCount = 0;

    for (const entry of entries) {
      if (entry.endsWith(".lproj") && entry !== "en.lproj") {
        await rm(join(frameworkResourcesDir, entry), {
          recursive: true,
          force: true,
        });
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(
        `[after-pack] ✓ Removed ${removedCount} unused locales from framework`,
      );
    }
  } catch {
    /* Resources dir may not exist or have different structure */
  }

  // 6. Report final app bundle size
  try {
    const appSize = execSync(`du -sh "${appPath}" 2>/dev/null | cut -f1`, {
      encoding: "utf-8",
    }).trim();
    console.log(`[after-pack] Final app bundle size: ${appSize}`);
  } catch {
    /* ignore */
  }

  console.log(`[after-pack] ${archLabel} optimizations complete\n");
};
