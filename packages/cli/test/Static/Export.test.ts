import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportStatic, formatStaticReport, selectStaticRoutes, staticFileFor } from '../../src/Static/Export';
import type { StaticRoute } from '../../src/Static/Export';

const route = (method: string, path: string, extra: Partial<StaticRoute> = {}): StaticRoute => ({
  method,
  path,
  args: [],
  ...extra,
});

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

describe('selectStaticRoutes()', () => {
  it('keeps the GET routes that read nothing from the request', () => {
    const selected = selectStaticRoutes([
      route('GET', '/api/posts'),
      route('HEAD', '/api/posts'),
      route('GET', '/'),
      route('OPTIONS', '/api/posts'),
      route('GET', '/_health/live', { internal: true }),
    ]);

    expect(selected.paths).toEqual(['/api/posts', '/']);
    expect(selected.skipped).toEqual([]);
  });

  it('says why every other route is left out', () => {
    const selected = selectStaticRoutes([
      route('POST', '/api/posts'),
      route('DELETE', '/api/posts/:id', { args: [{ type: 'param' }] }),
      route('GET', '/api/posts/:id', { args: [{ type: 'param' }] }),
      route('GET', '/files/**:path'),
      route('GET', '/search', { args: [{ type: 'query' }, { type: 'query' }, { type: 'header' }] }),
      route('GET', '/events', { sse: true }),
    ]);

    expect(selected.paths).toEqual([]);
    expect(selected.skipped).toEqual([
      { route: 'POST /api/posts', reason: 'a POST needs a server' },
      { route: 'DELETE /api/posts/:id', reason: 'a DELETE needs a server' },
      { route: 'GET /api/posts/:id', reason: 'the path has parameters: list the paths to render with --routes' },
      { route: 'GET /files/**:path', reason: 'the path has parameters: list the paths to render with --routes' },
      {
        route: 'GET /search',
        reason: 'the handler reads the request (query, header): list the path with --routes to render it anyway',
      },
      { route: 'GET /events', reason: 'an event stream needs a server' },
    ]);
  });
});

describe('staticFileFor()', () => {
  it.each([
    ['/api/posts', 'application/json', 'api/posts'],
    ['/api/posts/', 'application/json; charset=utf-8', 'api/posts'],
    ['/feed.xml', 'application/xml', 'feed.xml'],
    ['/', 'application/json', 'index.json'],
    ['/', 'text/plain', 'index'],
    ['/', 'text/html; charset=utf-8', 'index.html'],
    ['/about', 'text/html', 'about/index.html'],
    ['/docs/intro/', 'TEXT/HTML', 'docs/intro/index.html'],
    ['/legal.html', 'text/html', 'legal.html'],
    ['/api/posts?page=2', 'application/json', 'api/posts'],
    ['/raw', null, 'raw'],
  ])('writes %s (%s) to %s', (path, type, file) => {
    expect(staticFileFor(path, type)).toBe(file);
  });
});

describe('exportStatic()', () => {
  let root: string;
  let directory: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vercube-static-'));
    directory = join(root, 'dist-static');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const read = (file: string): string => readFileSync(join(directory, file), 'utf8');

  it('writes the answer of every route that needs no input', async () => {
    const fetch = vi.fn(async (request: Request) => {
      const { pathname } = new URL(request.url);

      return pathname === '/about'
        ? new Response('<h1>About</h1>', { headers: { 'content-type': 'text/html' } })
        : json({ path: pathname });
    });

    const report = await exportStatic({
      fetch,
      directory,
      routes: [route('GET', '/api/posts'), route('GET', '/about'), route('POST', '/api/posts')],
    });

    expect(JSON.parse(read('api/posts'))).toEqual({ path: '/api/posts' });
    expect(read('about/index.html')).toBe('<h1>About</h1>');
    expect(report.written).toEqual([
      { path: '/api/posts', file: 'api/posts', bytes: 21 },
      { path: '/about', file: 'about/index.html', bytes: 14 },
    ]);
    expect(report.skipped).toEqual([{ route: 'POST /api/posts', reason: 'a POST needs a server' }]);
    expect(fetch.mock.calls.map(([request]) => request.method)).toEqual(['GET', 'GET']);
  });

  it('renders the paths listed by hand, with or without a leading slash', async () => {
    const report = await exportStatic({
      fetch: async (request) => json({ id: new URL(request.url).pathname.split('/').pop() }),
      directory,
      routes: [route('GET', '/posts/:id', { args: [{ type: 'param' }] })],
      paths: ['/posts/1', 'posts/2', '/posts/1'],
    });

    expect(JSON.parse(read('posts/1'))).toEqual({ id: '1' });
    expect(JSON.parse(read('posts/2'))).toEqual({ id: '2' });
    expect(report.written.map((file) => file.path)).toEqual(['/posts/1', '/posts/2']);
    // the template itself is still reported: nothing says which other ids exist
    expect(report.skipped).toHaveLength(1);
  });

  it('copies the public directories first and skips the ones that are missing', async () => {
    const assets = join(root, 'public');

    mkdirSync(join(assets, 'img'), { recursive: true });
    writeFileSync(join(assets, 'img/logo.svg'), '<svg/>');
    writeFileSync(join(assets, 'index.html'), '<div id="app"></div>');

    const report = await exportStatic({
      fetch: async () => json({ ok: true }),
      directory,
      routes: [route('GET', '/api/health')],
      publicDirs: [assets, join(root, 'nope')],
    });

    expect(read('img/logo.svg')).toBe('<svg/>');
    expect(read('index.html')).toBe('<div id="app"></div>');
    expect(report.copied).toEqual([assets]);
  });

  it('starts from an empty directory', async () => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'stale.txt'), 'from the last run');

    await exportStatic({ fetch: async () => json({}), directory, routes: [] });

    expect(existsSync(join(directory, 'stale.txt'))).toBe(false);
  });

  it('reports a path that does not answer 200 and one whose request fails', async () => {
    const report = await exportStatic({
      fetch: async (request) => {
        const { pathname } = new URL(request.url);

        if (pathname === '/broken') {
          throw new Error('database unreachable');
        }

        return json({ message: 'gone' }, pathname === '/old' ? 301 : 404);
      },
      directory,
      routes: [route('GET', '/missing'), route('GET', '/broken')],
      paths: ['/old'],
    });

    expect(report.written).toEqual([]);
    expect(report.skipped).toEqual([
      { route: 'GET /missing', reason: 'answered 404, a static host can only serve a 200' },
      { route: 'GET /broken', reason: 'the request failed: database unreachable' },
      { route: 'GET /old', reason: 'answered 301' },
    ]);
    expect(existsSync(join(directory, 'missing'))).toBe(false);
  });

  it('gives up on a stream that does not end, and saves one that does', async () => {
    const encoder = new TextEncoder();
    const report = await exportStatic({
      fetch: async (request) => {
        const endless = new URL(request.url).pathname === '/ticks';

        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.enqueue(encoder.encode('a,b\n1,2\n'));

              if (!endless) {
                controller.close();
              }
            },
          }),
          { headers: { 'content-type': 'text/csv' } },
        );
      },
      directory,
      routes: [route('GET', '/export.csv'), route('GET', '/ticks')],
      timeout: 50,
    });

    expect(read('export.csv')).toBe('a,b\n1,2\n');
    expect(report.skipped).toEqual([
      { route: 'GET /ticks', reason: 'did not finish within 0.05s: a stream that does not end needs a server' },
    ]);
  });

  it('reports a file that cannot exist next to another', async () => {
    const assets = join(root, 'public');

    mkdirSync(assets);
    writeFileSync(join(assets, 'robots.txt'), 'User-agent: *');

    const report = await exportStatic({
      fetch: async () => json({ ok: true }),
      directory,
      publicDirs: [assets],
      routes: [route('GET', '/api/posts'), route('GET', '/robots.txt')],
      paths: ['/api/posts/1', '/api'],
    });

    expect(report.written.map((file) => file.file)).toEqual(['api/posts']);
    expect(report.skipped).toEqual([
      { route: 'GET /robots.txt', reason: 'robots.txt was already written by a public file or another route' },
      { route: 'GET /api/posts/1', reason: 'api/posts is already a file, so nothing can be written under it' },
      {
        route: 'GET /api',
        reason: 'api is already a directory: a static host cannot serve a path and paths under it unless the first is a page',
      },
    ]);
    expect(read('robots.txt')).toBe('User-agent: *');
  });

  it('never writes outside the output directory', async () => {
    const report = await exportStatic({
      fetch: async () => json({ ok: true }),
      directory,
      routes: [],
      paths: ['/..%2F..%2Fescape', '/a/../../escape'],
    });

    expect(existsSync(join(root, 'escape'))).toBe(false);
    // an encoded slash is part of a file name, a real `..` is resolved away
    expect(report.written.map((file) => file.file)).toEqual(['..%2F..%2Fescape', 'escape']);
    expect(existsSync(join(directory, 'escape'))).toBe(true);
  });

  it('writes what GitHub Pages looks for', async () => {
    await exportStatic({ fetch: async () => json({}), directory, routes: [], githubPages: true });

    expect(read('.nojekyll')).toBe('');
    expect(read('404.html')).toContain('Not found');
  });

  it('falls back to the single-page application for unknown paths, and keeps a 404 page that exists', async () => {
    const assets = join(root, 'public');

    mkdirSync(assets);
    writeFileSync(join(assets, 'index.html'), '<div id="app"></div>');

    await exportStatic({ fetch: async () => json({}), directory, routes: [], publicDirs: [assets], githubPages: true });

    expect(read('404.html')).toBe('<div id="app"></div>');

    writeFileSync(join(assets, '404.html'), '<h1>Lost</h1>');

    await exportStatic({ fetch: async () => json({}), directory, routes: [], publicDirs: [assets], githubPages: true });

    expect(read('404.html')).toBe('<h1>Lost</h1>');
  });

  it('does not write the GitHub Pages files unless asked', async () => {
    await exportStatic({ fetch: async () => json({}), directory, routes: [] });

    expect(existsSync(join(directory, '.nojekyll'))).toBe(false);
    expect(existsSync(join(directory, '404.html'))).toBe(false);
  });

  it('formats a report for the terminal', async () => {
    const report = await exportStatic({
      fetch: async () => json({ ok: true }),
      directory,
      routes: [route('GET', '/api/posts'), route('POST', '/api/posts')],
    });

    expect(formatStaticReport(report)).toEqual([
      '  /api/posts -> api/posts (11 B)',
      '',
      'Not exported:',
      '  POST /api/posts: a POST needs a server',
    ]);
    expect(formatStaticReport({ ...report, skipped: [] })).toEqual(['  /api/posts -> api/posts (11 B)']);
  });
});
