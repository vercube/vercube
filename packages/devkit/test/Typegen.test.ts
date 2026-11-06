import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTypegenOutput } from '@vercube/scan';
import { createHooks } from 'hookable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(readFileSync(result!.file, 'utf8')).toContain("from '../src/UserController'");
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

  it('regenerates when the route table changes or an imported file is gone, not on every report', async () => {
    const onMessage = watchRouteTypes(app({ typegen: true }))!;
    const file = join(root, '.vercube/routes.d.ts');
    const user = [routes[0]];

    await onMessage({ type: 'something else' });
    expect(() => statSync(file)).toThrow();

    await onMessage(message(user));
    const first = readFileSync(file, 'utf8');

    // same table: the file is not even regenerated, let alone rewritten
    rmSync(file);
    await onMessage(message(user));
    expect(() => statSync(file)).toThrow();

    // a changed table
    await onMessage(message([{ ...routes[0], handler: 'show' }]));
    expect(readFileSync(file, 'utf8')).toContain("RouteDef<UserController, 'show'");

    // the controller moved: same table, but the import would be stale
    mkdirSync(join(root, 'src/Controllers'));
    renameSync(join(root, 'src/UserController.ts'), join(root, 'src/Controllers/UserController.ts'));
    await onMessage(message([{ ...routes[0], handler: 'show' }]));
    expect(readFileSync(file, 'utf8')).toContain("from '../src/Controllers/UserController'");
    expect(first).toContain("from '../src/UserController'");
  });
});
