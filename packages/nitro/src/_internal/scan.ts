import { join, relative } from 'pathe';
import { glob } from 'tinyglobby';
import type { Nitro } from 'nitro/types';

export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}';

export type FileInfo = { path: string; fullPath: string };

export async function scanFiles(nitro: Nitro, name: string): Promise<FileInfo[]> {
  const files = await Promise.all(nitro.options.scanDirs.map((dir) => scanDir(nitro, dir, name))).then((r) => r.flat());
  return files;
}

export async function scanDir(nitro: Nitro, dir: string, name: string): Promise<FileInfo[]> {
  const fileNames = await glob(join(name, GLOB_SCAN_PATTERN), {
    cwd: dir,
    dot: true,
    ignore: nitro.options.ignore,
    absolute: true,
  }).catch((error) => {
    if (error?.code === 'ENOTDIR') {
      nitro.logger.warn(`Ignoring \`${join(dir, name)}\`. It must be a directory.`);
      return [];
    }
    throw error;
  });
  return fileNames
    .map((fullPath) => {
      return {
        fullPath,
        path: relative(join(dir, name), fullPath),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
