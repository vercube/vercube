import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/** What the static export needs to know about a route, a subset of the `routes` introspection section. */
export interface StaticRoute {
  method: string;
  /** Route template, such as `/users/:id`. */
  path: string;
  args: Array<{ type: string }>;
  /** Set on `@Sse()` routes. */
  sse?: true;
  /** Set on infrastructure routes: health probes, devtools. */
  internal?: true;
}

/** One file the export wrote. */
export interface StaticFile {
  /** The path that was requested. */
  path: string;
  /** Where the response was written, relative to the output directory. */
  file: string;
  bytes: number;
}

/** One route or path the export left out. */
export interface StaticSkip {
  /** `GET /users/:id`, or the requested path. */
  route: string;
  reason: string;
}

/** What a static export did. */
export interface StaticReport {
  directory: string;
  written: StaticFile[];
  skipped: StaticSkip[];
  /** Static directories copied into the output. */
  copied: string[];
}

/** Options of {@link exportStatic}. */
export interface StaticExportOptions {
  /** Answers a request, as the built application does. */
  fetch: (request: Request) => Response | Promise<Response>;
  /** The routes of the application. */
  routes: StaticRoute[];
  /** Where the files go. Emptied first. */
  directory: string;
  /** Directories copied into the output before anything is rendered, such as `public`. */
  publicDirs?: string[];
  /** Paths to render besides the routes that need no input, such as `/users/1` for `/users/:id`. */
  paths?: string[];
  /** The origin requests are made against. Only its host can show up in a response. */
  origin?: string;
  /** Milliseconds a path may take to answer in full, 30000 by default. A stream that never ends is given up on. */
  timeout?: number;
  /** Writes `.nojekyll` and a `404.html`, which GitHub Pages looks for. */
  githubPages?: boolean;
}

/** The fallback page of a static host that has no `index.html` to fall back to. */
const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Not found</title>
  </head>
  <body>
    <h1>Not found</h1>
  </body>
</html>
`;

/**
 * Sorts the routes of an application into the ones a static host can serve
 * and the ones that need a server.
 *
 * A route can be rendered ahead of time when it is a `GET` that reads nothing
 * from the request: no parameter, query, header, body or cookie. Its answer is
 * the same for everybody, so it can be a file.
 *
 * @param {StaticRoute[]} routes - The routes of the application
 * @returns {{ paths: string[]; skipped: StaticSkip[] }} The paths to render, and why each other route is left out
 */
export function selectStaticRoutes(routes: StaticRoute[]): { paths: string[]; skipped: StaticSkip[] } {
  const paths: string[] = [];
  const skipped: StaticSkip[] = [];

  for (const route of routes) {
    // infrastructure, and the HEAD twin every GET registers
    if (route.internal || route.method === 'HEAD' || route.method === 'OPTIONS') {
      continue;
    }

    const name = `${route.method} ${route.path}`;

    if (route.method !== 'GET') {
      skipped.push({ route: name, reason: `a ${route.method} needs a server` });
    } else if (route.sse) {
      skipped.push({ route: name, reason: 'an event stream needs a server' });
    } else if (/[:*]/.test(route.path)) {
      skipped.push({ route: name, reason: 'the path has parameters: list the paths to render with --routes' });
    } else if (route.args.length > 0) {
      const kinds = [...new Set(route.args.map((arg) => arg.type))].join(', ');

      skipped.push({
        route: name,
        reason: `the handler reads the request (${kinds}): list the path with --routes to render it anyway`,
      });
    } else {
      paths.push(route.path);
    }
  }

  return { paths: [...new Set(paths)], skipped };
}

/**
 * The file a rendered path is written to. A page becomes `index.html` in a
 * directory of its name, which is how a static host serves `/about`. Anything
 * else keeps the path it was requested at, so `fetch('/api/posts')` works
 * against the export as it does against the server.
 *
 * @param {string} path - The requested path, such as `/api/posts`
 * @param {string | null} contentType - The `Content-Type` of the response
 * @returns {string} The file, relative to the output directory
 */
export function staticFileFor(path: string, contentType: string | null): string {
  const clean = path.split(/[?#]/)[0].replaceAll(/^\/+|\/+$/g, '');
  const html = (contentType ?? '').toLowerCase().startsWith('text/html');

  if (html) {
    return clean === '' || clean.endsWith('.html') ? clean || 'index.html' : `${clean}/index.html`;
  }

  if (clean === '') {
    return (contentType ?? '').toLowerCase().includes('json') ? 'index.json' : 'index';
  }

  return clean;
}

/**
 * Writes an application as static files: copies its public directories, then
 * requests every path that can be rendered ahead of time and saves the
 * answers.
 *
 * Nothing fails silently. A route that needs a server, a path that did not
 * answer 200 and a file that would overwrite another are all in the report.
 *
 * @param {StaticExportOptions} options - What to render and where to
 * @returns {Promise<StaticReport>} What was written, copied and left out
 */
export async function exportStatic(options: StaticExportOptions): Promise<StaticReport> {
  const directory = resolve(options.directory);
  const origin = options.origin ?? 'http://localhost';
  const timeout = options.timeout ?? 30_000;
  const selected = selectStaticRoutes(options.routes);
  const report: StaticReport = { directory, written: [], skipped: [...selected.skipped], copied: [] };

  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });

  for (const source of options.publicDirs ?? []) {
    if (existsSync(source) && statSync(source).isDirectory()) {
      cpSync(source, directory, { recursive: true });
      report.copied.push(source);
    }
  }

  const requested = (options.paths ?? []).map((path) => (path.startsWith('/') ? path : `/${path}`));

  // a path listed by hand is no longer "left out", whatever its route reads
  const explicit = new Set(requested);
  const paths = [...new Set([...selected.paths, ...requested])];

  for (const path of paths) {
    // resolved the way a server would, so `/a/../b` is `/b` before it names a file
    const url = new URL(path, origin);
    let response: Response;
    let body: Uint8Array = EMPTY;

    try {
      // the answer and its whole body: a stream is only a file once it has ended
      const answered = await withTimeout(
        (async () => {
          const result = await options.fetch(new Request(url));

          return { result, bytes: result.status === 200 ? new Uint8Array(await result.arrayBuffer()) : undefined };
        })(),
        timeout,
      );

      if (answered === TIMED_OUT) {
        report.skipped.push({
          route: `GET ${path}`,
          reason: `did not finish within ${timeout / 1000}s: a stream that does not end needs a server`,
        });
        continue;
      }

      response = answered.result;
      body = answered.bytes ?? EMPTY;
    } catch (error) {
      report.skipped.push({ route: `GET ${path}`, reason: `the request failed: ${(error as Error).message}` });
      continue;
    }

    if (response.status !== 200) {
      // release the body of an answer that is not kept
      await response.body?.cancel().catch(() => {});
      report.skipped.push({
        route: `GET ${path}`,
        reason: explicit.has(path)
          ? `answered ${response.status}`
          : `answered ${response.status}, a static host can only serve a 200`,
      });
      continue;
    }

    const file = staticFileFor(url.pathname, response.headers.get('content-type'));
    const target = join(directory, file);

    // never outside the output directory, whatever the path says
    if (target !== directory && !target.startsWith(directory + sep)) {
      report.skipped.push({ route: `GET ${path}`, reason: 'the path leaves the output directory' });
      continue;
    }

    const conflict = findConflict(directory, file);

    if (conflict) {
      report.skipped.push({ route: `GET ${path}`, reason: conflict });
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    report.written.push({ path, file, bytes: body.byteLength });
  }

  if (options.githubPages) {
    // without it GitHub runs Jekyll over the files, which drops the ones starting with an underscore
    writeFileSync(join(directory, '.nojekyll'), '');

    const notFound = join(directory, '404.html');
    const index = join(directory, 'index.html');

    if (!existsSync(notFound)) {
      // a single-page application answers unknown paths with itself and routes on the client
      if (existsSync(index)) {
        cpSync(index, notFound);
      } else {
        writeFileSync(notFound, NOT_FOUND_PAGE);
      }
    }
  }

  return report;
}

/** The body of an answer that is not kept. */
const EMPTY = new Uint8Array(0);

/** What {@link withTimeout} resolves to when the time is up. */
const TIMED_OUT: unique symbol = Symbol('timed out');

/**
 * Waits for a promise for a limited time.
 *
 * @param {Promise<T>} promise - What to wait for
 * @param {number} ms - How long
 * @returns {Promise<T | typeof TIMED_OUT>} The value, or `TIMED_OUT`
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tells why a file cannot be written: a file system has no place for both
 * `api/posts` (a file) and `api/posts/1` (a file in a directory of that name).
 *
 * @param {string} directory - The output directory
 * @param {string} file - The file about to be written, relative to it
 * @returns {string | undefined} The reason, or undefined when the file can be written
 */
function findConflict(directory: string, file: string): string | undefined {
  const target = join(directory, file);

  if (existsSync(target)) {
    return statSync(target).isDirectory()
      ? `${file} is already a directory: a static host cannot serve a path and paths under it unless the first is a page`
      : `${file} was already written by a public file or another route`;
  }

  const segments = file.split('/');

  for (let depth = 1; depth < segments.length; depth++) {
    const parent = join(directory, ...segments.slice(0, depth));

    if (existsSync(parent) && !statSync(parent).isDirectory()) {
      return `${segments.slice(0, depth).join('/')} is already a file, so nothing can be written under it`;
    }
  }

  return undefined;
}

/**
 * Renders a report for the terminal.
 *
 * @param {StaticReport} report - What the export did
 * @returns {string[]} One line per file and per route left out
 */
export function formatStaticReport(report: StaticReport): string[] {
  const lines: string[] = [];

  for (const file of report.written) {
    lines.push(`  ${file.path} -> ${file.file} (${file.bytes} B)`);
  }

  if (report.skipped.length > 0) {
    lines.push('', 'Not exported:');

    for (const skip of report.skipped) {
      lines.push(`  ${skip.route}: ${skip.reason}`);
    }
  }

  return lines;
}
