import { scanDir as scanDirCore, scanFiles as scanFilesCore, GLOB_SCAN_PATTERN } from '@vercube/scan';
import type { FileInfo } from '@vercube/scan';
import type { Nitro } from 'nitro/types';

/**
 * Nitro-specific adapter over the shared `@vercube/scan` scanner. The underlying
 * file walking lives in `@vercube/scan`; these wrappers adapt Nitro's options and
 * logger to its decoupled signature so existing call sites keep working.
 */

export { GLOB_SCAN_PATTERN };
export type { FileInfo };

/**
 * Scans every configured Nitro scan directory for files inside `name`.
 * @param nitro - The nitro instance (provides `options.scanDirs` and `logger`).
 * @param name - The subdirectory to scan within each scan dir.
 * @returns The discovered files.
 */
export async function scanFiles(nitro: Nitro, name: string): Promise<FileInfo[]> {
  return scanFilesCore(nitro.options.scanDirs, name, nitro.logger);
}

/**
 * Scans a single base directory for files inside `name`.
 * @param nitro - The nitro instance (provides `logger`).
 * @param dir - The base directory to scan within.
 * @param name - The subdirectory to scan.
 * @returns The discovered files.
 */
export async function scanDir(nitro: Nitro, dir: string, name: string): Promise<FileInfo[]> {
  return scanDirCore(dir, name, nitro.logger);
}
