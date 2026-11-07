import { readFileSync } from 'node:fs';
import { extractMiddlewares, extractRoutes, extractServices } from './Extract';
import type { FileInfo, MiddlewareInfo, RouteInfo, ServiceInfo } from './Types';

/**
 * Reads a controller file from disk and returns all routes defined in classes
 * decorated with `@Controller` and methods decorated with HTTP decorators.
 *
 * The returned `import` statements still contain the placeholder source; resolve
 * them to the real file path with {@link resolveImports} when generating code.
 *
 * @param file - File info (path and fullPath) to analyze.
 * @returns A list of {@link RouteInfo} for every route in the file.
 */
export async function transformRoute(file: FileInfo): Promise<RouteInfo[]> {
  return extractRoutes(readFileSync(file.fullPath, 'utf8')).map((route) => ({ ...route, ...file }));
}

/**
 * Reads a file from disk and returns all `@Injectable`-decorated classes found within it.
 *
 * @param file - File info (path and fullPath) to analyze.
 * @returns A list of {@link ServiceInfo} for every injectable class in the file.
 */
export async function transformService(file: FileInfo): Promise<ServiceInfo[]> {
  return extractServices(readFileSync(file.fullPath, 'utf8')).map((service) => ({ ...service, ...file }));
}

/**
 * Reads a file from disk and returns all classes extending `BaseMiddleware` found within it.
 *
 * @param file - File info (path and fullPath) to analyze.
 * @returns A list of {@link MiddlewareInfo} for every middleware class in the file.
 */
export async function transformMiddleware(file: FileInfo): Promise<MiddlewareInfo[]> {
  return extractMiddlewares(readFileSync(file.fullPath, 'utf8')).map((middleware) => ({ ...middleware, ...file }));
}

/**
 * Replaces the placeholder import source in each entry with the entry's real
 * absolute file path, producing import statements that load the actual module.
 *
 * @param entries - Scanned entries whose `import` still references the placeholder source.
 * @param placeholder - The placeholder module specifier to replace.
 * @returns The entries with resolved `import` statements.
 */
export function resolveImports<T extends { import: string; fullPath: string }>(entries: T[], placeholder: string): T[] {
  return entries.map((entry) => ({ ...entry, import: resolveImportSource(entry.import, placeholder, entry.fullPath) }));
}

/**
 * Swaps the quoted placeholder specifier in an import statement for the real file path.
 *
 * The path is emitted as a JSON string literal, so quotes, backslashes and `$` sequences
 * in it cannot break (or inject into) the generated statement.
 *
 * @param statement - Import statement containing the placeholder specifier.
 * @param placeholder - The placeholder module specifier to replace.
 * @param fullPath - The real absolute file path.
 * @returns The import statement pointing at `fullPath`.
 */
export function resolveImportSource(statement: string, placeholder: string, fullPath: string): string {
  const literal = JSON.stringify(fullPath);
  return statement.replace(`'${placeholder}'`, () => literal);
}
