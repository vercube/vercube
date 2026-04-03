import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRoutes, getTransformedRoutes, scanRoutes, setupRoutes } from '../../src/setup/Routes';

function makeMockNitro(tmpDir: string, extra: Record<string, any> = {}) {
  return {
    options: {
      scanDirs: [tmpDir],
      apiDir: 'api',
      routesDir: 'routes',
      handlers: [],
      ignore: undefined,
      rootDir: tmpDir,
      serverDir: join(tmpDir, 'server'),
      ...extra,
    },
    logger: { warn: vi.fn() },
    routing: { sync: vi.fn() },
  } as any;
}

const controllerCode = `
  @Controller('/api')
  export class FooController {
    @Get('/foo')
    foo() {}
  }
`;

describe('clearRoutes', () => {
  it('should remove handlers using vercube runtime handler', () => {
    const handlers = [
      { handler: '@vercube/nitro/runtime/handler', route: '/foo', method: 'GET' },
      { handler: 'other-handler', route: '/bar', method: 'POST' },
    ] as any;
    const result = clearRoutes(handlers);
    expect(result).toHaveLength(1);
    expect(result[0].handler).toBe('other-handler');
  });

  it('should return all handlers when none are vercube handlers', () => {
    const handlers = [
      { handler: 'handler-a', route: '/a' },
      { handler: 'handler-b', route: '/b' },
    ] as any;
    expect(clearRoutes(handlers)).toHaveLength(2);
  });

  it('should return empty array when all handlers are vercube handlers', () => {
    const handlers = [{ handler: '@vercube/nitro/runtime/handler', route: '/a' }] as any;
    expect(clearRoutes(handlers)).toHaveLength(0);
  });
});

describe('scanRoutes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-routes-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should scan api and routes directories', async () => {
    mkdirSync(join(tmpDir, 'api'));
    mkdirSync(join(tmpDir, 'routes'));
    writeFileSync(join(tmpDir, 'api', 'FooController.ts'), controllerCode);
    writeFileSync(join(tmpDir, 'routes', 'BarController.ts'), controllerCode);

    const nitro = makeMockNitro(tmpDir);
    const result = await scanRoutes(nitro);
    expect(result).toHaveLength(2);
  });

  it('should return empty array when directories are empty', async () => {
    const nitro = makeMockNitro(tmpDir);
    const result = await scanRoutes(nitro);
    expect(result).toEqual([]);
  });

  it('should fall back to api/routes when apiDir/routesDir are not set', async () => {
    mkdirSync(join(tmpDir, 'api'));
    writeFileSync(join(tmpDir, 'api', 'FooController.ts'), controllerCode);

    const nitro = makeMockNitro(tmpDir, { apiDir: undefined, routesDir: undefined });
    const result = await scanRoutes(nitro);
    expect(result).toHaveLength(1);
  });

  it('should use custom apiDir and routesDir when specified', async () => {
    mkdirSync(join(tmpDir, 'custom-api'));
    mkdirSync(join(tmpDir, 'custom-routes'));
    writeFileSync(join(tmpDir, 'custom-api', 'FooController.ts'), controllerCode);

    const nitro = makeMockNitro(tmpDir, { apiDir: 'custom-api', routesDir: 'custom-routes' });
    const result = await scanRoutes(nitro);
    expect(result).toHaveLength(1);
  });
});

describe('getTransformedRoutes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-routes-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return routes with resolved import paths', async () => {
    mkdirSync(join(tmpDir, 'api'));
    const filePath = join(tmpDir, 'api', 'FooController.ts');
    writeFileSync(filePath, controllerCode);

    const nitro = makeMockNitro(tmpDir);
    const routes = await getTransformedRoutes(nitro);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe('/api/foo');
    expect(routes[0].import).toContain(filePath);
  });

  it('should return empty array when no controllers found', async () => {
    const nitro = makeMockNitro(tmpDir);
    const routes = await getTransformedRoutes(nitro);
    expect(routes).toEqual([]);
  });
});

describe('setupRoutes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-routes-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should add route handlers to nitro options', async () => {
    mkdirSync(join(tmpDir, 'api'));
    writeFileSync(join(tmpDir, 'api', 'FooController.ts'), controllerCode);

    const nitro = makeMockNitro(tmpDir);
    await setupRoutes(nitro);

    expect(nitro.options.handlers).toHaveLength(1);
    expect(nitro.options.handlers[0].route).toBe('/api/foo');
    expect(nitro.options.handlers[0].handler).toBe('@vercube/nitro/runtime/handler');
    expect(nitro.routing.sync).toHaveBeenCalled();
  });

  it('should clear existing vercube handlers before adding new ones', async () => {
    mkdirSync(join(tmpDir, 'api'));
    writeFileSync(join(tmpDir, 'api', 'FooController.ts'), controllerCode);

    const nitro = makeMockNitro(tmpDir, {
      handlers: [{ handler: '@vercube/nitro/runtime/handler', route: '/old' }],
    });

    await setupRoutes(nitro);
    expect(nitro.options.handlers.every((h: any) => h.route !== '/old')).toBe(true);
  });

  it('should add controller files to ignore list', async () => {
    mkdirSync(join(tmpDir, 'api'));
    writeFileSync(join(tmpDir, 'api', 'FooController.ts'), controllerCode);

    const nitro = makeMockNitro(tmpDir);
    await setupRoutes(nitro);

    expect(nitro.options.ignore.length).toBeGreaterThan(0);
  });
});
