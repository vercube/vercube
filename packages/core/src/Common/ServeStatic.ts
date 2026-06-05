import { serveStatic } from 'srvx/static';
import type { ServerPlugin } from 'srvx';

/**
 * Creates an HTTP server plugin that serves static files from a directory.
 *
 * The returned plugin registers a `srvx` static middleware that runs before the
 * application handler: it answers requests for existing files (and `index.html`
 * for `/`), letting unmatched requests fall through to the app's routes. Add it
 * with `HttpServer.addPlugin(...)`.
 *
 * @param {string} dir - Absolute path to the directory to serve files from.
 * @returns {ServerPlugin} A server plugin that serves static files from `dir`.
 */
export function serveStaticFiles(dir: string): ServerPlugin {
  return (server) => {
    server.options.middleware ??= [];
    server.options.middleware.push(serveStatic({ dir }));
  };
}
