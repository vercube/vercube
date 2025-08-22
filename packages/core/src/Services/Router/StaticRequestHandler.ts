import { createReadStream } from 'node:fs';
import { normalize, join, extname } from 'node:path';
import { stat as statAsync } from 'node:fs/promises';
import { ConfigTypes } from '../../Types/ConfigTypes';
import { mime } from '../../Utils/Mine';

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

    // Only handle GET requests
    if (request.method !== 'GET') {
      return;
    }

    const url = new URL(request.url);
    const path = normalize(url.pathname);

    // Remove dirnames and join with root
    let relativePath = path;
    for (const dir of dirs) {
      relativePath = relativePath.replace(dir, '');
    }

    for (const dir of dirs) {
      const fullPath = join(process.cwd(), dir, relativePath);

      try {
        const stats = await statAsync(fullPath);

        if (stats.isDirectory()) {
          continue;
        }

        if (stats.isFile()) {
          return this.serveFile(fullPath, stats);
        }
      } catch {
        // silent catch
        continue;
      }
    }
  }

  /**
   * Serves a static file and returns a Response object
   *
   * @param {string} path - The path to the file to serve
   * @param {any} stats - The stats object for the file
   * @returns {Promise<Response>} A promise that resolves to a Response object
   */
  private async serveFile(path: string, stats: any): Promise<Response> {
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
      headers.set('ETag', `W/"${stats.size}-${stats.mtime.getTime()}"`);
    }

    const stream = createReadStream(path);
    return new Response(stream as any, {
      headers,
    });
  }
}
