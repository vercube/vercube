import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanDir, scanFiles } from '../src/Scan';

vi.mock('tinyglobby', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tinyglobby')>();
  return { ...actual, glob: vi.fn(actual.glob) };
});

describe('scanDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-scan-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty array for an empty directory', async () => {
    expect(await scanDir(tmpDir, 'routes')).toEqual([]);
  });

  it('finds ts files in a subdirectory', async () => {
    const routesDir = join(tmpDir, 'routes');
    mkdirSync(routesDir);
    writeFileSync(join(routesDir, 'FooController.ts'), '');

    const result = await scanDir(tmpDir, 'routes');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('FooController.ts');
    expect(result[0].fullPath).toContain('FooController.ts');
  });

  it('finds multiple files and sorts them', async () => {
    const routesDir = join(tmpDir, 'routes');
    mkdirSync(routesDir);
    writeFileSync(join(routesDir, 'ZController.ts'), '');
    writeFileSync(join(routesDir, 'AController.ts'), '');

    const result = await scanDir(tmpDir, 'routes');
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('AController.ts');
    expect(result[1].path).toBe('ZController.ts');
  });

  it('warns and returns an empty array when glob throws ENOTDIR', async () => {
    const enotdir = Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
    vi.mocked(glob).mockRejectedValueOnce(enotdir);
    const warn = vi.fn();

    const result = await scanDir(tmpDir, 'routes', { warn });
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('routes'));
  });

  it('re-throws non-ENOTDIR errors', async () => {
    const error = new Error('some other error');
    vi.mocked(glob).mockRejectedValueOnce(error);
    await expect(scanDir(tmpDir, 'routes')).rejects.toThrow('some other error');
  });

  it('finds files with various extensions', async () => {
    const apiDir = join(tmpDir, 'api');
    mkdirSync(apiDir);
    writeFileSync(join(apiDir, 'route.ts'), '');
    writeFileSync(join(apiDir, 'handler.js'), '');
    writeFileSync(join(apiDir, 'other.mts'), '');

    const result = await scanDir(tmpDir, 'api');
    expect(result).toHaveLength(3);
  });
});

describe('scanFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-scan-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans across multiple base directories', async () => {
    const dir1 = join(tmpDir, 'dir1');
    const dir2 = join(tmpDir, 'dir2');
    mkdirSync(join(dir1, 'routes'), { recursive: true });
    mkdirSync(join(dir2, 'routes'), { recursive: true });
    writeFileSync(join(dir1, 'routes', 'A.ts'), '');
    writeFileSync(join(dir2, 'routes', 'B.ts'), '');

    const result = await scanFiles([dir1, dir2], 'routes');
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when no files are found', async () => {
    expect(await scanFiles([tmpDir], 'routes')).toEqual([]);
  });
});
