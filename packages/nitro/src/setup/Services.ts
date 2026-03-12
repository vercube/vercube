import { scanFiles, type FileInfo } from '../_internal/scan';
import { SERVICE_IMPORT_SOURCE, transformService, type ServiceInfo } from '../build/Services';
import type { Nitro } from 'nitro/types';

/**
 * Scans the project source directory for `@Injectable`-decorated classes and returns
 * their transformed service info with resolved import paths.
 */
export async function getTransformedServices(nitro: Nitro): Promise<ServiceInfo[]> {
  const files = await scanServices(nitro);
  return (await Promise.all(files.map((file) => transformService(file))).then((r) => r.flat())).map((service) => ({
    ...service,
    import: service.import.replace(SERVICE_IMPORT_SOURCE, service.fullPath),
  }));
}

/**
 * Scans the root of each scanDir for `@Injectable`-decorated service files.
 * scanDirs already points to the server source root (e.g. `src/`), so we scan
 * from `.` to cover all subdirectories without adding an extra path segment.
 */
export async function scanServices(nitro: Nitro): Promise<FileInfo[]> {
  return scanFiles(nitro, '.');
}
