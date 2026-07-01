import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
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

/**
 * Wraps a `fetch` handler so unmatched frontend navigations fall back to
 * `index.html` from `dir`. API routes that return 404 are left untouched when
 * the request does not look like a document navigation.
 *
 * @param fetch - The underlying application `fetch` handler.
 * @param dir - Absolute path to the built frontend directory.
 * @returns A `fetch` handler with SPA fallback behaviour.
 */
export function withSpaFallback(
  fetch: (request: Request) => Response | Promise<Response>,
  dir: string,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const response = await fetch(request);
    if (response.status !== 404) {
      return response;
    }
    return (await tryServeSpaIndex(request, dir)) ?? response;
  };
}

/**
 * Serves `index.html` from `publicDir` when the request looks like a browser
 * navigation to a client-side route.
 *
 * @param request - The incoming request.
 * @param publicDir - Absolute path to the built frontend directory.
 * @returns The HTML response, or `undefined` when fallback does not apply.
 */
export async function tryServeSpaIndex(request: Request, publicDir?: string): Promise<Response | undefined> {
  if (!publicDir || !shouldServeSpaIndex(request)) {
    return undefined;
  }

  try {
    const html = await readFile(join(resolve(publicDir), 'index.html'));
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch {
    return undefined;
  }
}

/**
 * Returns true when the request looks like a browser navigation that should
 * receive `index.html` instead of an API 404.
 */
function shouldServeSpaIndex(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }

  const accept = request.headers.get('accept');
  if (accept && !accept.includes('text/html') && !accept.includes('*/*')) {
    return false;
  }

  const pathname = new URL(request.url).pathname;
  if (pathname === '/favicon.ico') {
    return false;
  }

  const extension = extname(pathname);
  return !extension || extension === '.html';
}
