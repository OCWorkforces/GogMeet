/**
 * Package Info Cache
 * Loads package.json once and provides typed access to package metadata
 * Eliminates duplicate file reads and provides type safety
 */

import { app } from 'electron';
import path from 'path';
import { readFileSync } from 'fs';
import log from 'electron-log';

/**
 * Package.json structure with commonly used fields
 */
export interface PackageInfo {
  name: string;
  productName: string;
  version: string;
  description: string;
  repository: string;
  homepage: string;
  author: string;
  license?: string;
  main?: string;
  [key: string]: unknown; // Allow access to other fields
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
export function getPackageInfo(): Readonly<PackageInfo> {
  if (!packageInfo) {
    try {
      const pkgPath = path.join(app.getAppPath(), 'package.json');
      const pkgContent = readFileSync(pkgPath, 'utf-8');
      packageInfo = JSON.parse(pkgContent) as PackageInfo;
      log.debug('[PackageInfo] Loaded package.json');
    } catch (error) {
      log.error('[PackageInfo] Failed to load package.json:', error);
      // Return minimal fallback to prevent crashes
      packageInfo = {
        name: 'googlechat',
        productName: 'Google Chat',
        version: '0.0.0',
        description: 'Google Chat',
        repository: '',
        homepage: '',
        author: '',
      };
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
  log.debug('[PackageInfo] Cleared package info cache');
}

/**
 * Check if package info is loaded
 * @returns true if package.json has been loaded
 */
export function isPackageInfoLoaded(): boolean {
  return packageInfo !== null;
}
