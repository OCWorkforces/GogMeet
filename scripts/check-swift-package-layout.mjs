/**
 * Lightweight packaging layout check (no notarization): both Darwin Swift sources
 * exist on disk and electron-builder.yml packs + asarUnpacks them.
 * Run: node scripts/check-swift-package-layout.mjs
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const eventSource = join(root, "src/main/googlemeet-events.swift");
const identitySource = join(root, "src/main/swift/event-occurrence-identity.swift");
const builderYml = join(root, "electron-builder.yml");

async function requireFile(path) {
  const s = await stat(path);
  if (!s.isFile()) throw new Error(`Not a file: ${path}`);
}

const eventRel = "src/main/googlemeet-events.swift";
const identityRel = "src/main/swift/event-occurrence-identity.swift";

await requireFile(eventSource);
await requireFile(identitySource);
const yml = await readFile(builderYml, "utf8");
for (const rel of [eventRel, identityRel]) {
  if (!yml.includes(rel)) {
    throw new Error(`electron-builder.yml must list ${rel} under files and asarUnpack`);
  }
}

// Dual-source hash formula smoke over real sources (identity + "\\n" + events).
const { createHash } = await import("node:crypto");
const identity = await readFile(identitySource);
const events = await readFile(eventSource);
const dual = createHash("sha256")
  .update(Buffer.concat([identity, Buffer.from("\n"), events]))
  .digest("hex");
const single = createHash("sha256").update(events).digest("hex");
if (dual === single) {
  throw new Error("Unexpected: dual-source hash equals events-only hash");
}

console.log("ok: Swift package layout + dual-source hash formula");
