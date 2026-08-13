/**
 * Best-effort owner-only modes for secret/cache paths (POSIX).
 * Windows ignores mode bits; chmod failures are non-fatal.
 */

import { chmod as chmodCb } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const chmod = promisify(chmodCb);

export const SECURE_DIR_MODE = 0o700;
export const SECURE_FILE_MODE = 0o600;

export async function ensureSecureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true, mode: SECURE_DIR_MODE });
  try {
    await chmod(dirPath, SECURE_DIR_MODE);
  } catch {
    // umask / non-POSIX: non-fatal
  }
}

export async function writeSecureFile(filePath: string, data: string | Buffer): Promise<void> {
  await writeFile(filePath, data, { mode: SECURE_FILE_MODE });
  try {
    await chmod(filePath, SECURE_FILE_MODE);
  } catch {
    // non-fatal
  }
}
