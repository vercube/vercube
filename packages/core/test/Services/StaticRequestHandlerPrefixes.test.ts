import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StaticRequestHandler } from '../../src/Services/Router/StaticRequestHandler';

describe('StaticRequestHandler mount prefixes', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'vercube-static-prefix-'));
    mkdirSync(join(root, 'public'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'public', 'a.txt'), 'a');
    writeFileSync(join(root, 'assets', 'b.txt'), 'b');
    vi.spyOn(process, 'cwd').mockReturnValue(root);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const handler = (dirs: string[]) => {
    const h = new StaticRequestHandler();
    h.initialize({ dirs });
    return (path: string) => h.handleRequest(new Request(`http://localhost${path}`));
  };

  it('serves each dir only under its own prefix', async () => {
    const get = handler(['public', 'assets']);

    expect(await (await get('/public/a.txt'))?.text()).toBe('a');
    expect(await (await get('/assets/b.txt'))?.text()).toBe('b');
  });

  it.each(['/assets/a.txt', '/public/b.txt', '/a.txt', '/b.txt'])('does not serve %s with several dirs', async (path) => {
    expect(await handler(['public', 'assets'])(path)).toBeUndefined();
  });

  it('keeps the optional prefix for a single dir', async () => {
    const get = handler(['public']);

    expect(await (await get('/a.txt'))?.text()).toBe('a');
    expect(await (await get('/public/a.txt'))?.text()).toBe('a');
    expect(await get('/b.txt')).toBeUndefined();
  });
});
