import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanDir, scanFiles } from '../../src/_internal/scan';

vi.mock('tinyglobby', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tinyglobby')>();
  return { ...actual, glob: vi.fn(actual.glob) };
});

function makeMockNitro(scanDirs: string[]) {
  return {
    options: { scanDirs },
    logger: { warn: vi.fn() },
  } as any;
}

describe('scanDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-scan-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty array for empty directory', async () => {
    const nitro = makeMockNitro([tmpDir]);
    const result = await scanDir(nitro, tmpDir, 'routes');
    expect(result).toEqual([]);
  });

  it('should find ts files in subdirectory', async () => {
    const routesDir = join(tmpDir, 'routes');
    mkdirSync(routesDir);
    writeFileSync(join(routesDir, 'FooController.ts'), '');

    const nitro = makeMockNitro([tmpDir]);
    const result = await scanDir(nitro, tmpDir, 'routes');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('FooController.ts');
    expect(result[0].fullPath).toContain('FooController.ts');
  });

  it('should find multiple files and sort them', async () => {
    const routesDir = join(tmpDir, 'routes');
    mkdirSync(routesDir);
    writeFileSync(join(routesDir, 'ZController.ts'), '');
    writeFileSync(join(routesDir, 'AController.ts'), '');

    const nitro = makeMockNitro([tmpDir]);
    const result = await scanDir(nitro, tmpDir, 'routes');
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('AController.ts');
    expect(result[1].path).toBe('ZController.ts');
  });

  it('should warn and return empty array when glob throws ENOTDIR', async () => {
    const enotdir = Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
    vi.mocked(glob).mockRejectedValueOnce(enotdir);

    const nitro = makeMockNitro([tmpDir]);
    const result = await scanDir(nitro, tmpDir, 'routes');
    expect(result).toEqual([]);
    expect(nitro.logger.warn).toHaveBeenCalledWith(expect.stringContaining('routes'));
  });

  it('should re-throw non-ENOTDIR errors', async () => {
    const error = new Error('some other error');
    vi.mocked(glob).mockRejectedValueOnce(error);

    const nitro = makeMockNitro([tmpDir]);
    await expect(scanDir(nitro, tmpDir, 'routes')).rejects.toThrow('some other error');
  });

  it('should find files with various extensions', async () => {
    const apiDir = join(tmpDir, 'api');
    mkdirSync(apiDir);
    writeFileSync(join(apiDir, 'route.ts'), '');
    writeFileSync(join(apiDir, 'handler.js'), '');
    writeFileSync(join(apiDir, 'other.mts'), '');

    const nitro = makeMockNitro([tmpDir]);
    const result = await scanDir(nitro, tmpDir, 'api');
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

  it('should scan across multiple scanDirs', async () => {
    const dir1 = join(tmpDir, 'dir1');
    const dir2 = join(tmpDir, 'dir2');
    mkdirSync(join(dir1, 'routes'), { recursive: true });
    mkdirSync(join(dir2, 'routes'), { recursive: true });
    writeFileSync(join(dir1, 'routes', 'A.ts'), '');
    writeFileSync(join(dir2, 'routes', 'B.ts'), '');

    const nitro = makeMockNitro([dir1, dir2]);
    const result = await scanFiles(nitro, 'routes');
    expect(result).toHaveLength(2);
  });

  it('should return empty array when no files found', async () => {
    const nitro = makeMockNitro([tmpDir]);
    const result = await scanFiles(nitro, 'routes');
    expect(result).toEqual([]);
  });
});
