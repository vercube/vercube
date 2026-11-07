import { createReadStream } from 'node:fs';
import { realpath, stat as statAsync } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { mime } from '../../Utils/Mine';
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

export class StaticRequestHandler {
  /**
   * The options for the static server
   */
  private fOptions: ConfigTypes.ServerOptions['static'] | undefined;

  /**
   * Initializes the static server with the given options
   *
   * @param {ConfigTypes.ServerOptions['static']} options - The options for the static server
   * @returns {void}
   */
  public initialize(options: ConfigTypes.ServerOptions['static']): void {
    this.fOptions = options;
  }

  /**
   * Handles HTTP requests for static files
   *
   * @param {Request} request - The incoming HTTP request
   * @returns {Promise<void | Response>} A promise that resolves to void or a Response object
   */
  public async handleRequest(request: Request): Promise<void | Response> {
    // Get dirs that has to be static provided
    const dirs = this.fOptions?.dirs ?? ([] as string[]);

    // No static request was provided
    if (!dirs) {
      return;
    }

    // Only handle GET and HEAD requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return;
    }

    let path: string;

    try {
      path = normalize(decodeURIComponent(new URL(request.url).pathname));
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
      const prefix = `/${dir.replace(/^\/+|\/+$/g, '')}`;

      if (path === prefix || path.startsWith(`${prefix}/`)) {
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
        const realRoot = await realpath(root);
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
