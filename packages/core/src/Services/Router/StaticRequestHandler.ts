import { createReadStream } from 'node:fs';
import { realpath, stat as statAsync } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { mime } from '../../Utils/Mine';
import { getRequestPathname } from '../../Utils/Url';
import type { ConfigTypes } from '../../Types/ConfigTypes';

/**
 * Handles serving static files over HTTP
 *
 * The StaticRequestHandler is responsible for:
 * - Serving static files from configured directories
 * - Setting appropriate content types and headers
 * - Handling caching and ETags
 * - Processing GET requests for static assets
 */

/** How long the real path of a static directory is remembered, in milliseconds. */
const ROOT_TTL = 1000;

/** What is known about a served directory. */
interface StaticRoot {
  /** Its real path, null when it does not exist. */
  path: Promise<string | null>;
  /** Whether it exists, undefined until `path` settled. */
  exists: boolean | undefined;
  /** When this stops being trusted, as a timestamp. */
  expires: number;
}

export class StaticRequestHandler {
  /**
   * The options for the static server
   */
  private fOptions: ConfigTypes.ServerOptions['static'] | undefined;

  /**
   * The directories served, without duplicates
   */
  private fDirs: string[] = [];

  /**
   * Real paths of the served directories, see {@link StaticRequestHandler.realRoot}
   */
  private fRoots: Map<string, StaticRoot> = new Map();

  /**
   * Initializes the static server with the given options
   *
   * @param {ConfigTypes.ServerOptions['static']} options - The options for the static server
   * @returns {void}
   */
  public initialize(options: ConfigTypes.ServerOptions['static']): void {
    this.fOptions = options;
    // The default `public` merges into user dirs, so duplicates are common
    this.fDirs = [...new Set(options?.dirs ?? ([] as string[]))];
    this.fRoots.clear();
  }

  /**
   * Whether a request can be for a static file at all: a `GET` or `HEAD` while
   * at least one served directory may exist. Answered without touching the
   * request path or the file system, so a miss on an application without static
   * files skips this handler entirely.
   *
   * The default configuration serves `public`, which an API usually does not
   * have. A directory found missing is remembered for a moment
   * ({@link StaticRequestHandler.realRoot}), and while every directory is known
   * to be missing no request is for a file.
   *
   * @param {Request} request - The incoming HTTP request
   * @returns {boolean} False when the request cannot be answered with a file
   */
  public handles(request: Request): boolean {
    if (this.fDirs.length === 0 || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return false;
    }

    const pathname = getRequestPathname(request);
    // Anything the path normalization of `handleRequest` could turn into
    // another path is left to it.
    const plain = !pathname.includes('%') && !pathname.includes('//') && !pathname.includes('\\');
    const single = this.fDirs.length === 1;
    const now = Date.now();
    const cwd = process.cwd();

    for (const dir of this.fDirs) {
      // With several directories each one is only served under its own prefix
      if (!single && plain && !isUnder(pathname, toPrefix(dir))) {
        continue;
      }

      const known = this.fRoots.get(join(cwd, dir));

      if (known === undefined || known.expires <= now || known.exists !== false) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolves the real path of a static directory, remembered for a moment.
   *
   * Every unmatched request asks for it, and it rarely changes: without the
   * memory a miss cost a `realpath` of the directory each time, and a directory
   * that does not exist failed that call on every 404.
   *
   * @param {string} root - The directory
   * @returns {Promise<string | null>} Its real path, or null when it does not exist
   * @private
   */
  private realRoot(root: string): Promise<string | null> {
    const now = Date.now();
    const known = this.fRoots.get(root);

    if (known !== undefined && known.expires > now) {
      return known.path;
    }

    const entry: StaticRoot = {
      path: realpath(root).then(
        (path) => {
          entry.exists = true;

          return path;
        },
        () => {
          entry.exists = false;

          return null;
        },
      ),
      exists: undefined,
      expires: now + ROOT_TTL,
    };

    this.fRoots.set(root, entry);

    return entry.path;
  }

  /**
   * Handles HTTP requests for static files
   *
   * @param {Request} request - The incoming HTTP request
   * @returns {Promise<void | Response>} A promise that resolves to void or a Response object
   */
  public async handleRequest(request: Request): Promise<void | Response> {
    // No directory is served, or the method cannot be for a file
    if (!this.handles(request)) {
      return;
    }

    const dirs = this.fDirs;
    let path: string;

    try {
      path = normalize(decodeURIComponent(getRequestPathname(request)));
    } catch {
      // malformed percent-encoding
      return;
    }

    if (path.includes('\0')) {
      return;
    }

    // With several dirs each one is served only under its own mount prefix.
    // A single dir also answers without the prefix.
    const candidates: Array<{ dir: string; relativePath: string }> = [];

    for (const dir of dirs) {
      const prefix = toPrefix(dir);

      if (isUnder(path, prefix)) {
        candidates.push({ dir, relativePath: path.slice(prefix.length) });
      }
    }

    const dotfiles = this.fOptions?.dotfiles ?? 'ignore';

    if (candidates.length === 0 && dirs.length === 1) {
      candidates.push({ dir: dirs[0], relativePath: path });
    }

    for (const { dir, relativePath } of candidates) {
      const root = join(process.cwd(), dir);
      const fullPath = join(root, relativePath);

      // Never serve anything outside the static directory
      if (!isInside(root, fullPath)) {
        continue;
      }

      try {
        // Resolve symlinks so a link inside the directory cannot reach a file outside it
        const realRoot = await this.realRoot(root);

        if (realRoot === null) {
          continue;
        }

        const realFile = await realpath(fullPath);

        if (!isInside(realRoot, realFile)) {
          continue;
        }

        // Checked on the requested path and on the resolved one, as a link to a dotfile is still a dotfile
        if (dotfiles !== 'allow' && (hasDotSegment(relativePath) || hasDotSegment(relative(realRoot, realFile)))) {
          return dotfiles === 'deny' ? new Response(null, { status: 403 }) : undefined;
        }

        const stats = await statAsync(realFile);

        if (stats.isDirectory()) {
          continue;
        }

        if (stats.isFile()) {
          return this.serveFile(request, realFile, stats);
        }
      } catch {
        // silent catch
        continue;
      }
    }
  }

  /**
   * Serves a static file and returns a Response object. A HEAD request gets the
   * headers only, a matching `If-None-Match` a 304.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {string} path - The path to the file to serve
   * @param {any} stats - The stats object for the file
   * @returns {Promise<Response>} A promise that resolves to a Response object
   */
  private async serveFile(request: Request, path: string, stats: any): Promise<Response> {
    const headers = new Headers();
    const ext = extname(path).toLowerCase();
    const contentType = mime.getType(ext) || 'application/octet-stream';

    headers.set('Content-Type', contentType);
    headers.set('Content-Length', stats.size.toString());

    if (this.fOptions?.maxAge && this.fOptions.maxAge > 0) {
      const directives = ['public', `max-age=${this.fOptions.maxAge}`];

      if (this.fOptions?.immutable) {
        directives.push('immutable');
      }

      headers.set('Cache-Control', directives.join(', '));
    }

    if (this.fOptions?.etag) {
      const etag = `W/"${stats.size}-${stats.mtime.getTime()}"`;

      headers.set('ETag', etag);

      if (matchesEtag(request.headers.get('if-none-match'), etag)) {
        headers.delete('Content-Type');
        headers.delete('Content-Length');

        return new Response(null, { status: 304, headers });
      }
    }

    if (request.method === 'HEAD') {
      return new Response(null, { headers });
    }

    const stream = createReadStream(path);
    return new Response(stream as any, {
      headers,
    });
  }
}

/**
 * The URL prefix a static directory is mounted under.
 *
 * @param {string} dir - The directory, as configured
 * @returns {string} For example `/public`
 */
function toPrefix(dir: string): string {
  return `/${dir.replace(/^\/+|\/+$/g, '')}`;
}

/**
 * Whether a URL path is a mount prefix or lies under it.
 *
 * @param {string} path - The URL path
 * @param {string} prefix - The mount prefix
 * @returns {boolean} True when the path belongs to the prefix
 */
function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Whether a path is the root itself or lies inside it.
 *
 * @param {string} root - The directory
 * @param {string} path - The path to check
 * @returns {boolean} True when the path does not leave the root
 */
function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Whether any segment of a path starts with a dot, such as `.env` or `.git/config`.
 *
 * @param {string} path - The path relative to the static directory
 * @returns {boolean} True when the path names a dotfile or goes through a dot directory
 */
function hasDotSegment(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment.length > 1 && segment.startsWith('.'));
}

/**
 * Whether an `If-None-Match` header matches an entity tag, compared weakly as
 * RFC 9110 requires for `If-None-Match`.
 *
 * @param {string | null} header - The `If-None-Match` header
 * @param {string} etag - The entity tag of the file
 * @returns {boolean} True when the client already has this version
 */
function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) {
    return false;
  }

  if (header.trim() === '*') {
    return true;
  }

  const opaque = (tag: string): string => tag.trim().replace(/^W\//, '');
  const expected = opaque(etag);

  return header.split(',').some((tag) => opaque(tag) === expected);
}
