import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
    writeFileSync(join(root, 'outside.txt'), 'outside');
    writeFileSync(join(root, 'public', '.env'), 'SECRETENV');
    mkdirSync(join(root, 'public', '.git'));
    writeFileSync(join(root, 'public', '.git', 'config'), 'gitconfig');
    symlinkSync(join(root, 'outside.txt'), join(root, 'public', 'link.txt'));
    symlinkSync(join(root, 'public-secret'), join(root, 'public', 'linked-dir'));
    symlinkSync(join(root, 'public', 'nested', 'a.txt'), join(root, 'public', 'inner-link.txt'));
    symlinkSync(join(root, 'public', '.env'), join(root, 'public', 'env-link.txt'));

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
    '/.env',
    '/public/.env',
    '/%2eenv',
    '/.git/config',
    '/public/.git/config',
    '/link.txt',
    '/public/link.txt',
    '/linked-dir/secret.txt',
    '/env-link.txt',
  ])('does not serve %s', async (path) => {
    expect(await get(path)).toBeUndefined();
  });

  it('serves a symlink that stays inside the static directory', async () => {
    expect(await (await get('/inner-link.txt'))?.text()).toBe('nested');
  });

  it('answers 403 for a dotfile when dotfiles is deny', async () => {
    const deny = new StaticRequestHandler();
    deny.initialize({ dirs: ['public'], dotfiles: 'deny' });

    expect((await deny.handleRequest(new Request('http://localhost/.env')))?.status).toBe(403);
    expect((await deny.handleRequest(new Request('http://localhost/.git/config')))?.status).toBe(403);
    expect(await deny.handleRequest(new Request('http://localhost/.missing'))).toBeUndefined();
  });

  it('serves a dotfile when dotfiles is allow, but still not a symlink out of the directory', async () => {
    const allow = new StaticRequestHandler();
    allow.initialize({ dirs: ['public'], dotfiles: 'allow' });

    expect(await (await allow.handleRequest(new Request('http://localhost/.env')))?.text()).toBe('SECRETENV');
    expect(await allow.handleRequest(new Request('http://localhost/link.txt'))).toBeUndefined();
  });
});
