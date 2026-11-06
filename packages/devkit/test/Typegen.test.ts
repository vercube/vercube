import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTypegenOutput } from '@vercube/scan';
import { createHooks } from 'hookable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { builtEntry } from '../src/Typegen/Inspect';
import { typegen, watchRouteTypes } from '../src/Typegen/Typegen';
import type { DevKitTypes } from '../src/Types/DevKitTypes';
import type { ConfigTypes, IntrospectionTypes } from '@vercube/core';

vi.mock('consola', () => ({ default: { warn: vi.fn(), success: vi.fn() } }));

let root: string;

function app(build: ConfigTypes.BuildOptions = {}): DevKitTypes.App {
  return { hooks: createHooks(), config: { build: { root, ...build } } } as DevKitTypes.App;
}

function pkg(deps: Record<string, string>): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: deps }));
}

const routes = [
  {
    id: 'GET /users/:id',
    method: 'GET',
    path: '/users/:id',
    controller: 'UserController',
    handler: 'get',
    args: [{ idx: 0, type: 'param', name: 'id', validated: false }],
    middlewares: [],
    actions: 0,
    simple: false,
  },
  {
    id: 'GET /ghost',
    method: 'GET',
    path: '/ghost',
    controller: 'GhostController',
    handler: 'get',
    args: [],
    middlewares: [],
    actions: 0,
    simple: true,
  },
] satisfies IntrospectionTypes.RouteDescription[];

beforeEach(() => {
  root = join(tmpdir(), `vercube-devkit-typegen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/UserController.ts'), `@Controller('/users') export class UserController {}`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolveTypegenOutput', () => {
  it('is off unless the project depends on @vercube/client', () => {
    pkg({ '@vercube/core': '1' });
    expect(resolveTypegenOutput(root, undefined)).toBeNull();

    pkg({ '@vercube/client': '1' });
    expect(resolveTypegenOutput(root, undefined)).toBe(join(root, '.vercube/routes.d.ts'));
  });

  it('follows build.typegen when it is set', () => {
    pkg({ '@vercube/client': '1' });
    expect(resolveTypegenOutput(root, false)).toBeNull();

    pkg({});
    expect(resolveTypegenOutput(root, true)).toBe(join(root, '.vercube/routes.d.ts'));
    expect(resolveTypegenOutput(root, { output: 'web/api.d.ts' })).toBe(join(root, 'web/api.d.ts'));
  });
});

describe('typegen', () => {
  it('writes the route map from the given routes and scans the project for controllers', async () => {
    const consola = (await import('consola')).default;
    const result = await typegen(app({ typegen: true }), { routes });

    expect(result).toEqual({
      file: join(root, '.vercube/routes.d.ts'),
      written: true,
      routes: 2,
      skipped: [{ id: 'GET /ghost', reason: 'no source file found for GhostController' }],
      files: [join(root, 'src/UserController.ts')],
    });
    expect(readFileSync(result!.file, 'utf8')).toContain(
      "'GET /users/:id': RouteDef<UserController, 'get', { param: { id: 0 } }>;",
    );
    expect(consola.warn).toHaveBeenCalledWith({
      tag: 'typegen',
      message: 'Skipped GET /ghost: no source file found for GhostController',
    });

    expect((await typegen(app({ typegen: true }), { routes }))!.written).toBe(false);
  });

  it('reads controller files from the discovery section when there is one', async () => {
    writeFileSync(join(root, 'src/Other.ts'), `@Controller('/x') export class UserController {}`);

    const result = await typegen(app({ typegen: true }), {
      routes,
      discovery: {
        root,
        generatedAt: '',
        controllers: [{ name: 'UserController', path: 'src/UserController.ts' }],
        services: [],
        middlewares: [],
        routes: [],
      },
    });

    // a project-wide scan would have found UserController twice
    expect(readFileSync(result!.file, 'utf8')).toContain("from '../src/UserController.js'");
  });

  it('does nothing when off, unless forced', async () => {
    expect(await typegen(app(), { routes })).toBeNull();
    expect((await typegen(app(), { routes, force: true }))?.written).toBe(true);
  });
});

describe('watchRouteTypes', () => {
  const message = (list: IntrospectionTypes.RouteDescription[]) => ({ type: 'vercube:routes', routes: list, discovery: null });

  it('is off when typegen is', () => {
    expect(watchRouteTypes(app())).toBeNull();
  });

  it('follows route, controller and output changes, writing only when the map differs', async () => {
    const onMessage = watchRouteTypes(app({ typegen: true }))!;
    const file = join(root, '.vercube/routes.d.ts');
    const user = [routes[0]];

    await onMessage({ type: 'something else' });
    expect(() => statSync(file)).toThrow();

    await onMessage(message(user));
    const first = readFileSync(file, 'utf8');
    const written = statSync(file).mtimeMs;

    // same table: the file is left alone
    await onMessage(message(user));
    expect(statSync(file).mtimeMs).toBe(written);

    // deleted while dev runs: written again
    rmSync(file);
    await onMessage(message(user));
    expect(readFileSync(file, 'utf8')).toBe(first);

    // a changed table
    await onMessage(message([{ ...routes[0], handler: 'show' }]));
    expect(readFileSync(file, 'utf8')).toContain("RouteDef<UserController, 'show'");

    // the controller moved: same table, but the import would be stale
    mkdirSync(join(root, 'src/Controllers'));
    renameSync(join(root, 'src/UserController.ts'), join(root, 'src/Controllers/UserController.ts'));
    await onMessage(message([{ ...routes[0], handler: 'show' }]));
    expect(readFileSync(file, 'utf8')).toContain("from '../src/Controllers/UserController.js'");
    expect(first).toContain("from '../src/UserController.js'");

    // a controller that was not exported: same table, now it is
    await onMessage(message(routes));
    expect(readFileSync(file, 'utf8')).not.toContain('GhostController');
    writeFileSync(join(root, 'src/Ghost.ts'), `@Controller('/ghost') export class GhostController {}`);
    await onMessage(message(routes));
    expect(readFileSync(file, 'utf8')).toContain("'GET /ghost': RouteDef<GhostController, 'get'>;");
  });
});

/** A built entry that answers `VERCUBE_INSPECT` the way core does, with `body` as the sections. */
function fakeEntry(body: string, file = 'dist/index.mjs'): void {
  mkdirSync(join(root, file, '..'), { recursive: true });
  writeFileSync(
    join(root, file),
    `import { writeFileSync } from 'node:fs';\n${body}\nwriteFileSync(process.env.VERCUBE_INSPECT_OUT, JSON.stringify(sections));\n`,
  );
}

describe('typegen from the built application', () => {
  it('reads the routes the application reports', async () => {
    fakeEntry(
      `const sections = { routes: { id: 'routes', data: ${JSON.stringify(routes.slice(0, 1))} }, discovery: { data: null } };`,
    );

    const result = await typegen(app({ typegen: true }));

    expect(readFileSync(result!.file, 'utf8')).toContain(
      "'GET /users/:id': RouteDef<UserController, 'get', { param: { id: 0 } }>;",
    );
  });

  it('inspects the entry the build names after the first of several', async () => {
    fakeEntry(`const sections = { routes: { data: [] } };`, 'dist/server.mjs');

    expect(builtEntry(app({ entry: ['src/server.ts', 'src/worker.ts'] }))).toBe('server.mjs');
    expect(builtEntry(app({ entry: 'src/main.ts' }))).toBe('index.mjs');
    expect((await typegen(app({ typegen: true, entry: ['src/server.ts'] })))!.routes).toBe(0);
  });

  it('reaches an entry that only listens when it should, even with VERCUBE_LISTEN=0', async () => {
    fakeEntry(
      `if (process.env.VERCUBE_LISTEN !== '1') process.exit(0);\nconst sections = { routes: { data: ${JSON.stringify(routes.slice(0, 1))} } };`,
    );
    vi.stubEnv('VERCUBE_LISTEN', '0');

    try {
      expect((await typegen(app({ typegen: true })))!.routes).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('refuses to replace the map when the routes section is missing', async () => {
    fakeEntry(`const sections = {};`);

    await expect(typegen(app({ typegen: true }))).rejects.toThrow('did not report its routes');
  });

  it('gives up on an application that never finishes booting', async () => {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist/index.mjs'), 'setInterval(() => {}, 1000);\n');

    const { inspect } = await import('../src/Typegen/Inspect');

    await expect(inspect(app(), ['routes'], undefined, 300)).rejects.toThrow('did not finish within 0.3s');
  });

  it('stays off with typegen: false, even when forced', async () => {
    expect(await typegen(app({ typegen: false }), { routes, force: true })).toBeNull();
  });
});
