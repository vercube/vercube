import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/setup/Hooks', () => ({ setupHooks: vi.fn() }));
vi.mock('../../src/setup/Routes', () => ({ getTransformedRoutes: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/setup/Services', () => ({ getTransformedServices: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/setup/Middleware', () => ({ getTransformedMiddlewares: vi.fn().mockResolvedValue([]) }));

import { vercubeNitro } from '../../src/plugin/VercubePlugin';
import { setupHooks } from '../../src/setup/Hooks';
import { getTransformedMiddlewares } from '../../src/setup/Middleware';
import { getTransformedRoutes } from '../../src/setup/Routes';
import { getTransformedServices } from '../../src/setup/Services';

function makeMockNitro() {
  return {
    options: {
      virtual: {} as Record<string, string>,
      plugins: [] as string[],
      rootDir: '/tmp/test',
    },
  } as any;
}

describe('vercubeNitro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTransformedRoutes).mockResolvedValue([]);
    vi.mocked(getTransformedServices).mockResolvedValue([]);
    vi.mocked(getTransformedMiddlewares).mockResolvedValue([]);
  });

  it('should return a nitro module with name and setup', () => {
    const module = vercubeNitro();
    expect(module.name).toBe('@vercube/nitro');
    expect(typeof module.setup).toBe('function');
  });

  it('should call setupHooks on setup', async () => {
    const nitro = makeMockNitro();
    await vercubeNitro().setup!(nitro);
    expect(setupHooks).toHaveBeenCalledWith(nitro, expect.any(Object));
  });

  it('should register the vercube virtual plugin', async () => {
    const nitro = makeMockNitro();
    await vercubeNitro().setup!(nitro);
    expect(nitro.options.virtual['#internal/vercube-route-plugin']).toBeDefined();
    expect(nitro.options.plugins).toContain('#internal/vercube-route-plugin');
  });

  it('should include routes in the virtual plugin', async () => {
    vi.mocked(getTransformedRoutes).mockResolvedValue([
      {
        route: '/api/foo',
        method: 'GET',
        import: "import { FooController } from '/path/FooController.ts';",
        importClassName: 'FooController',
        params: [],
        fullPath: '/path/FooController.ts',
        path: 'FooController.ts',
      },
    ]);

    const nitro = makeMockNitro();
    await vercubeNitro().setup!(nitro);

    const virtual = nitro.options.virtual['#internal/vercube-route-plugin'];
    expect(virtual).toContain('FooController');
    expect(virtual).toContain('app.container.bind(FooController)');
  });

  it('should include services in the virtual plugin', async () => {
    vi.mocked(getTransformedServices).mockResolvedValue([
      {
        import: "import { UserService } from '/path/UserService.ts';",
        importClassName: 'UserService',
        fullPath: '/path/UserService.ts',
        path: 'UserService.ts',
      },
    ]);

    const nitro = makeMockNitro();
    await vercubeNitro().setup!(nitro);

    const virtual = nitro.options.virtual['#internal/vercube-route-plugin'];
    expect(virtual).toContain('UserService');
    expect(virtual).toContain('app.container.bind(UserService)');
  });

  it('should deduplicate services already registered as routes', async () => {
    vi.mocked(getTransformedRoutes).mockResolvedValue([
      {
        route: '/api/foo',
        method: 'GET',
        import: "import { FooController } from '/path/FooController.ts';",
        importClassName: 'FooController',
        params: [],
        fullPath: '/path/FooController.ts',
        path: 'FooController.ts',
      },
    ]);
    vi.mocked(getTransformedServices).mockResolvedValue([
      {
        import: "import { FooController } from '/path/FooController.ts';",
        importClassName: 'FooController',
        fullPath: '/path/FooController.ts',
        path: 'FooController.ts',
      },
    ]);

    const nitro = makeMockNitro();
    await vercubeNitro().setup!(nitro);

    const virtual = nitro.options.virtual['#internal/vercube-route-plugin'];
    const bindCount = (virtual.match(/app\.container\.bind\(FooController\)/g) || []).length;
    expect(bindCount).toBe(1);
  });

  it('should include setupFile import when provided', async () => {
    const nitro = makeMockNitro();
    await vercubeNitro({ setupFile: './src/boot.ts' }).setup!(nitro);

    const virtual = nitro.options.virtual['#internal/vercube-route-plugin'];
    expect(virtual).toContain('__vercubeSetup__');
  });

  it('should not include setupFile when not provided', async () => {
    const nitro = makeMockNitro();
    await vercubeNitro().setup!(nitro);

    const virtual = nitro.options.virtual['#internal/vercube-route-plugin'];
    expect(virtual).not.toContain('__vercubeSetup__');
  });

  it('should merge custom options with defaults', async () => {
    const nitro = makeMockNitro();
    await vercubeNitro({ scanDirs: ['custom'] }).setup!(nitro);
    expect(getTransformedServices).toHaveBeenCalledWith(nitro, expect.arrayContaining(['custom']));
  });
});
