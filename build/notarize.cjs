/**
 * notarize.cjs — Apple notarization + stapling for macOS builds
 *
 * Sole notarization owner (mac.notarize remains false in electron-builder.yml).
 * Runs after signing so the stapled ticket is present before DMG/ZIP containers.
 *
 * Required environment variables:
 * - APPLE_ID
 * - APPLE_TEAM_ID
 * - APPLE_APP_SPECIFIC_PASSWORD (preferred) or APPLE_APP_PASSWORD (legacy)
 */
const { notarize } = require("@electron/notarize");
const { execFileSync } = require("node:child_process");

const APP_ID = "com.ocworkforces.gogmeet";

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  const appleId = process.env["APPLE_ID"];
  const appleTeamId = process.env["APPLE_TEAM_ID"];
  const appleAppPassword =
    process.env["APPLE_APP_SPECIFIC_PASSWORD"] || process.env["APPLE_APP_PASSWORD"];

  if (!appleId || !appleTeamId || !appleAppPassword) {
    console.warn(
      "[notarize] Skipping: APPLE_ID, APPLE_TEAM_ID, or APPLE_APP_SPECIFIC_PASSWORD not set",
    );
    return;
  }

  if (!process.env["APPLE_APP_SPECIFIC_PASSWORD"] && process.env["APPLE_APP_PASSWORD"]) {
    console.warn(
      "[notarize] Using legacy APPLE_APP_PASSWORD; prefer APPLE_APP_SPECIFIC_PASSWORD",
    );
  }

  console.log(`[notarize] Notarizing ${appName} (${APP_ID})...`);
  await notarize({
    appBundleId: APP_ID,
    tool: "notarytool",
    appPath,
    appleId,
    appleIdPassword: appleAppPassword,
    teamId: appleTeamId,
  });

  console.log(`[notarize] Stapling ${appPath}...`);
  execFileSync("xcrun", ["stapler", "staple", appPath], { stdio: "inherit" });
  execFileSync("xcrun", ["stapler", "validate", appPath], { stdio: "inherit" });
  console.log("[notarize] Notarize + staple complete");
};
