import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTransformedMiddlewares, scanMiddlewares } from '../../src/setup/Middleware';

function makeMockNitro(tmpDir: string, ignoreInitial?: string[]) {
  return {
    options: {
      scanDirs: [tmpDir],
      ignore: ignoreInitial,
      rootDir: tmpDir,
      serverDir: join(tmpDir, 'server'),
    },
    logger: { warn: vi.fn() },
  } as any;
}

const middlewareCode = `
  export class AuthMiddleware extends BaseMiddleware {
    handle() {}
  }
`;

describe('scanMiddlewares', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-middleware-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty array when no middleware files found', async () => {
    const nitro = makeMockNitro(tmpDir);
    const result = await scanMiddlewares(nitro);
    expect(result).toEqual([]);
  });

  it('should find middleware files and add them to ignore list', async () => {
    const middlewareDir = join(tmpDir, 'middleware');
    mkdirSync(middlewareDir);
    writeFileSync(join(middlewareDir, 'AuthMiddleware.ts'), middlewareCode);

    const nitro = makeMockNitro(tmpDir);
    const result = await scanMiddlewares(nitro);
    expect(result).toHaveLength(1);
    expect(nitro.options.ignore.length).toBeGreaterThan(0);
  });

  it('should work when ignore is undefined initially', async () => {
    const middlewareDir = join(tmpDir, 'middleware');
    mkdirSync(middlewareDir);
    writeFileSync(join(middlewareDir, 'AuthMiddleware.ts'), middlewareCode);

    const nitro = makeMockNitro(tmpDir, undefined);
    await scanMiddlewares(nitro);
    expect(nitro.options.ignore.length).toBeGreaterThan(0);
  });

  it('should deduplicate ignore entries', async () => {
    const middlewareDir = join(tmpDir, 'middleware');
    mkdirSync(middlewareDir);
    writeFileSync(join(middlewareDir, 'AuthMiddleware.ts'), middlewareCode);

    const nitro = makeMockNitro(tmpDir);
    await scanMiddlewares(nitro);
    const ignoreCount = nitro.options.ignore.length;
    await scanMiddlewares(nitro);
    expect(nitro.options.ignore.length).toBe(ignoreCount);
  });
});

describe('getTransformedMiddlewares', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-middleware-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return middlewares with resolved import paths', async () => {
    const middlewareDir = join(tmpDir, 'middleware');
    mkdirSync(middlewareDir);
    const filePath = join(middlewareDir, 'AuthMiddleware.ts');
    writeFileSync(filePath, middlewareCode);

    const nitro = makeMockNitro(tmpDir);
    const middlewares = await getTransformedMiddlewares(nitro);
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].importClassName).toBe('AuthMiddleware');
    expect(middlewares[0].import).toContain(filePath);
  });

  it('should return empty array when no middleware classes found', async () => {
    const middlewareDir = join(tmpDir, 'middleware');
    mkdirSync(middlewareDir);
    writeFileSync(join(middlewareDir, 'plain.ts'), 'export class PlainClass {}');

    const nitro = makeMockNitro(tmpDir);
    const middlewares = await getTransformedMiddlewares(nitro);
    expect(middlewares).toEqual([]);
  });
});
