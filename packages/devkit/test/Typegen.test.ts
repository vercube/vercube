import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHooks } from 'hookable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { builtEntry } from '../src/Typegen/Inspect';
import { resolveTypegenOutput, typegen } from '../src/Typegen/Typegen';
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
    expect(resolveTypegenOutput(app())).toBeNull();

    pkg({ '@vercube/client': '1' });
    expect(resolveTypegenOutput(app())).toBe(join(root, '.vercube/routes.d.ts'));
  });

  it('follows build.typegen when it is set', () => {
    pkg({ '@vercube/client': '1' });
    expect(resolveTypegenOutput(app({ typegen: false }))).toBeNull();

    pkg({});
    expect(resolveTypegenOutput(app({ typegen: true }))).toBe(join(root, '.vercube/routes.d.ts'));
    expect(resolveTypegenOutput(app({ typegen: { output: 'web/api.d.ts' } }))).toBe(join(root, 'web/api.d.ts'));
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
