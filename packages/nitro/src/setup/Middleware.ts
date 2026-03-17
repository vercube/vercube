import { scanFiles, type FileInfo } from '../_internal/scan';
import { MIDDLEWARE_IMPORT_SOURCE, transformMiddleware, type MiddlewareInfo } from '../build/Middleware';
import type { Nitro } from 'nitro/types';

/**
 * Gets the transformed middleware from the middleware directory.
 */
export async function getTransformedMiddlewares(nitro: Nitro): Promise<MiddlewareInfo[]> {
  const files = await scanMiddlewares(nitro);
  return (await Promise.all(files.map((file) => transformMiddleware(file))).then((r) => r.flat())).map((middleware) => ({
    ...middleware,
    import: middleware.import.replace(MIDDLEWARE_IMPORT_SOURCE, middleware.fullPath),
  }));
}

/**
 * Scans the middleware directory for classes extending `BaseMiddleware` and
 * excludes those files from Nitro's native middleware handling.
 */
export async function scanMiddlewares(nitro: Nitro): Promise<FileInfo[]> {
  const files = await scanFiles(nitro, 'middleware');

  // Exclude middleware class files from Nitro's native handling so Nitro
  // does not try to auto-register them as H3 middleware.
  nitro.options.ignore = [
    ...new Set([
      ...(nitro.options.ignore ?? []),
      ...files.map((file) =>
        file.fullPath.replace(nitro.options.rootDir, '').replace(String(nitro.options?.serverDir), '').replace('src/', ''),
      ),
    ]),
  ];

  return files;
}
