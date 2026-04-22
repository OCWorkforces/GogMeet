/**
 * Package Info Cache
 * Loads package.json once and provides typed access to package metadata
 * Eliminates duplicate file reads and provides type safety
 */

import { app } from 'electron';
import path from 'path';
import { readFileSync } from 'fs';

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
export function getPackageInfo(): Readonly<PackageInfo> {
  if (!packageInfo) {
    try {
      const pkgPath = path.join(app.getAppPath(), 'package.json');
      const pkgContent = readFileSync(pkgPath, 'utf-8');
      const parsed = JSON.parse(pkgContent) as Partial<PackageInfo>;
      if (
        typeof parsed.name !== 'string' ||
        typeof parsed.productName !== 'string' ||
        typeof parsed.version !== 'string' ||
        typeof parsed.description !== 'string' ||
        typeof parsed.repository !== 'string' ||
        typeof parsed.homepage !== 'string' ||
        typeof parsed.author !== 'string'
      ) {
        throw new Error('package.json is missing one or more required fields');
      }
      packageInfo = {
        name: parsed.name,
        productName: parsed.productName,
        version: parsed.version,
        description: parsed.description,
        repository: parsed.repository,
        homepage: parsed.homepage,
        author: parsed.author,
        ...(parsed.license !== undefined ? { license: parsed.license } : {}),
        ...(parsed.main !== undefined ? { main: parsed.main } : {}),
      };
    } catch (error) {
      console.error('[PackageInfo] Failed to load package.json:', error);
      // Return minimal fallback to prevent crashes
      packageInfo = {
        name: 'gogmeet',
        productName: 'GogMeet',
        version: '1.0.0',
        description: 'GogMeet is a desktop application that helps you keep track of your Google Meet meetings and reminds you before they start.',
        repository: 'https://github.com/OCWorkforces/GogMeet',
        homepage: 'https://github.com/OCWorkforces/GogMeet',
        author: 'OCWorkforces Engineers',
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
}

/**
 * Check if package info is loaded
 * @returns true if package.json has been loaded
 */
export function isPackageInfoLoaded(): boolean {
  return packageInfo !== null;
}
