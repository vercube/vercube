import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StaticRequestHandler } from '../../src/Services/Router/StaticRequestHandler';

describe('StaticRequestHandler path traversal', () => {
  let root: string;
  let handler: StaticRequestHandler;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'vercube-static-'));
    mkdirSync(join(root, 'public', 'nested'), { recursive: true });
    mkdirSync(join(root, 'public-secret'));
    writeFileSync(join(root, 'public', 'index.html'), '<h1>ok</h1>');
    writeFileSync(join(root, 'public', 'nested', 'a.txt'), 'nested');
    writeFileSync(join(root, 'public', 'with space.txt'), 'space');
    writeFileSync(join(root, 'public-secret', 'secret.txt'), 'secret');
    writeFileSync(join(root, 'package.json'), '{"secret":true}');

    vi.spyOn(process, 'cwd').mockReturnValue(root);

    handler = new StaticRequestHandler();
    handler.initialize({ dirs: ['public'] });
  });

  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const get = (path: string) => handler.handleRequest(new Request(`http://localhost${path}`));

  it('serves files inside the static directory', async () => {
    expect(await (await get('/public/index.html'))?.text()).toBe('<h1>ok</h1>');
    expect(await (await get('/index.html'))?.text()).toBe('<h1>ok</h1>');
    expect(await (await get('/public/nested/a.txt'))?.text()).toBe('nested');
    expect(await (await get('/public/with%20space.txt'))?.text()).toBe('space');
  });

  it.each([
    '/..public/package.json',
    '/../package.json',
    '/public/../package.json',
    '/public/..%2fpackage.json',
    '/public/%2e%2e/package.json',
    '/public/%2e%2e%2fpackage.json',
    '/public/..%5cpackage.json',
    '/..%2fpublic-secret/secret.txt',
    '/public/../public-secret/secret.txt',
    '/public-secret/secret.txt',
    '/public/index.html%00.txt',
    '/public/%E0%A4%A',
  ])('does not serve %s', async (path) => {
    expect(await get(path)).toBeUndefined();
  });
});
