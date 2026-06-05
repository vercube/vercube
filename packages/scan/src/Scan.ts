import { join, relative } from 'pathe';
import { glob } from 'tinyglobby';
import type { FileInfo, ScanLogger } from './Types';

/**
 * Glob pattern matching every source file extension the scanner understands.
 */
export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}';

/**
 * Scans a single base directory for files inside the named subdirectory.
 *
 * Globs `<name>/**` relative to `dir`, returning each match as a {@link FileInfo}
 * with its absolute path and the path relative to `<dir>/<name>`. Results are
 * sorted by relative path for deterministic output.
 *
 * @param dir - The base directory to scan within.
 * @param name - The subdirectory (e.g. 'api', 'routes', 'services') to look in.
 * @param logger - Optional logger used to warn when `<dir>/<name>` is not a directory.
 * @returns A sorted list of discovered files.
 */
export async function scanDir(dir: string, name: string, logger?: ScanLogger): Promise<FileInfo[]> {
  const fileNames = await glob(join(name, GLOB_SCAN_PATTERN), {
    cwd: dir,
    dot: true,
    absolute: true,
  }).catch((error) => {
    if (error?.code === 'ENOTDIR') {
      logger?.warn(`Ignoring \`${join(dir, name)}\`. It must be a directory.`);
      return [];
    }
    throw error;
  });

  return fileNames
    .map((fullPath) => ({
      fullPath,
      path: relative(join(dir, name), fullPath),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Scans every base directory for files inside the named subdirectory.
 *
 * @param baseDirs - The base directories to scan (e.g. the project source roots).
 * @param name - The subdirectory to look in within each base directory.
 * @param logger - Optional logger forwarded to {@link scanDir}.
 * @returns The flattened list of discovered files across all base directories.
 */
export async function scanFiles(baseDirs: string[], name: string, logger?: ScanLogger): Promise<FileInfo[]> {
  return Promise.all(baseDirs.map((dir) => scanDir(dir, name, logger))).then((r) => r.flat());
}
