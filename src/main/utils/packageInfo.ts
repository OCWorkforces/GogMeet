/**
 * Package Info Cache
 * Loads package.json once and provides typed access to package metadata
 * Eliminates duplicate file reads and provides type safety
 */

import { app } from "electron";
import path from "path";
import { readFileSync } from "fs";
import { err, type AppResult } from "../../domain/entities/result.js";
import { formatAppError } from "../../domain/entities/errors.js";
import { parseJsonObject } from "../../domain/entities/parse-json.js";

/**
 * Package.json structure with commonly used fields
 */
export interface PackageInfo {
  readonly name: string;
  readonly productName: string;
  readonly version: string;
  readonly description: string;
  readonly repository: string;
  readonly homepage: string;
  readonly author: string;
  readonly license?: string;
  readonly main?: string;
}

/**
 * Cached package.json data
 */
let packageInfo: PackageInfo | null = null;

/**
 * Get package.json metadata
 * Loads once on first call, then returns cached value
 * @returns Readonly package info object
 */
function validatePackageInfo(parsed: Record<string, unknown>): AppResult<PackageInfo> {
  if (
    typeof parsed["name"] !== "string" ||
    typeof parsed["productName"] !== "string" ||
    typeof parsed["version"] !== "string" ||
    typeof parsed["description"] !== "string" ||
    typeof parsed["repository"] !== "string" ||
    typeof parsed["homepage"] !== "string" ||
    typeof parsed["author"] !== "string"
  ) {
    return err({
      kind: "validation",
      field: "package.json",
      message: "missing required fields",
    });
  }
  const license = parsed["license"];
  const main = parsed["main"];
  const value: PackageInfo = {
    name: parsed["name"],
    productName: parsed["productName"],
    version: parsed["version"],
    description: parsed["description"],
    repository: parsed["repository"],
    homepage: parsed["homepage"],
    author: parsed["author"],
    ...(typeof license === "string" ? { license } : {}),
    ...(typeof main === "string" ? { main } : {}),
  };
  const result: AppResult<PackageInfo> = { ok: true, value };
  return result;
}

export function getPackageInfo(): Readonly<PackageInfo> {
  if (!packageInfo) {
    const pkgPath = path.join(app.getAppPath(), "package.json");
    let pkgContent: string;
    try {
      pkgContent = readFileSync(pkgPath, "utf-8");
    } catch (error) {
      console.error("[PackageInfo] Failed to load package.json:", error);
      packageInfo = fallbackPackageInfo();
      return Object.freeze(packageInfo);
    }
    const result = parseJsonObject(pkgContent, "package.json", validatePackageInfo);
    if (!result.ok) {
      console.error("[PackageInfo] Failed to load package.json:", formatAppError(result.error));
      packageInfo = fallbackPackageInfo();
    } else {
      packageInfo = result.value;
    }
  }

  // Return frozen object to prevent mutations
  return Object.freeze(packageInfo);
}

/**
 * Clear cached package info (useful for testing)
 */
export function clearPackageInfoCache(): void {
  packageInfo = null;
}

/**
 * Check if package info is loaded
 * @returns true if package.json has been loaded
 */
export function isPackageInfoLoaded(): boolean {
  return packageInfo !== null;
}

function fallbackPackageInfo(): PackageInfo {
  return {
    name: "gogmeet",
    productName: "GogMeet",
    version: "1.0.0",
    description:
      "GogMeet is a desktop application that helps you keep track of your Google Meet meetings and reminds you before they start.",
    repository: "https://github.com/iWorkforces/GogMeet",
    homepage: "https://github.com/iWorkforces/GogMeet",
    author: "iWorkforces Engineers",
  };
}
