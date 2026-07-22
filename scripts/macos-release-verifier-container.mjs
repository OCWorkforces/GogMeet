import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { ReleaseVerificationError } from "./macos-release-verifier-helpers.mjs";

export async function findOnlyApp(root) {
  const apps = await findApps(root);
  if (apps.length !== 1) {
    throw new ReleaseVerificationError(`Expected one contained GogMeet.app, found ${apps.length}`);
  }
  return apps[0];
}

async function findApps(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const apps = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      apps.push(path);
    } else if (entry.isDirectory()) {
      apps.push(...(await findApps(path)));
    }
  }
  return apps;
}
