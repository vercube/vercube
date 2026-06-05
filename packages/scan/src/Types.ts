/**
 * Basic information about a scanned source file.
 */
export type FileInfo = {
  /** The path of the file relative to the directory it was scanned from. */
  path: string;
  /** The absolute path of the file on disk. */
  fullPath: string;
};

/**
 * Represents a single extracted route from a controller class.
 */
export interface RouteInfo extends FileInfo {
  /** The import statement required to load the controller class. */
  import: string;
  /** The name of the import statement. */
  importClassName: string;
  /** The full normalized route path, including the base controller path and method path. */
  route: string;
  /** The HTTP method in uppercase (e.g. 'GET', 'POST', 'PUT'). */
  method: string;
  /** Array of route parameter names extracted from path segments prefixed with ':'. */
  params: string[];
}

/**
 * Represents a single injectable service class discovered during scanning.
 */
export interface ServiceInfo extends FileInfo {
  /** The import statement required to load the service class. */
  import: string;
  /** The name of the imported class. */
  importClassName: string;
}

/**
 * Represents a single middleware class discovered during scanning.
 */
export interface MiddlewareInfo extends FileInfo {
  /** The import statement required to load the middleware class. */
  import: string;
  /** The name of the imported class. */
  importClassName: string;
}

/**
 * Minimal logger interface used to report non-fatal scanning issues.
 */
export interface ScanLogger {
  warn(message: string): void;
}
