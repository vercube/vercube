import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createRouteTypesWriter,
  findControllers,
  generateRouteTypes,
  resolveControllers,
  TYPEGEN_HEADER,
  writeRouteTypes,
} from '../src/Typegen';
import type { ControllerSource, TypegenRoute } from '../src/Typegen';

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `vercube-typegen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Sources without the classes each file can name, which these tests do not look at. */
function withoutTypes<T extends Record<string, ControllerSource | null>>(
  found: T,
): Record<string, Omit<ControllerSource, 'types'> | null> {
  return Object.fromEntries(
    Object.entries(found).map(([name, source]) => [name, source && { file: source.file, exportName: source.exportName }]),
  );
}

function write(path: string, code: string): string {
  const file = join(root, path);

  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, code);

  return file;
}

describe('findControllers', () => {
  it('finds exported, default-exported, re-exported and private controllers', async () => {
    const a = write('src/Controllers/A.ts', `@Controller('/a') export class AController {}`);
    const b = write('src/Controllers/B.ts', `@Controller('/b') export default class BController {}`);
    const c = write('src/Controllers/C.ts', `@Controller('/c') class CController {}\nexport { CController as Renamed };`);
    const d = write('src/Controllers/D.ts', `@Controller('/d') class DController {}`);
    const e = write('src/Controllers/E.ts', `@Controller() class EController {}\nexport default EController;`);

    write('src/Services/S.ts', `export class NotAController {}`);

    expect(withoutTypes(await findControllers(root))).toEqual({
      AController: { file: a, exportName: 'AController' },
      BController: { file: b, exportName: 'default' },
      CController: { file: c, exportName: 'Renamed' },
      DController: { file: d, exportName: null },
      EController: { file: e, exportName: 'default' },
    });
  });

  it('marks a name declared twice as ambiguous and ignores tests and build output', async () => {
    write('src/one/X.ts', `@Controller('/x') export class XController {}`);
    write('src/two/X.ts', `@Controller('/x') export class XController {}`);
    write('src/Y.test.ts', `@Controller('/y') export class YController {}`);
    write('dist/Z.mjs', `@Controller('/z') export class ZController {}`);
    write('node_modules/pkg/W.ts', `@Controller('/w') export class WController {}`);

    expect(withoutTypes(await findControllers(root))).toEqual({ XController: null });
  });

  it('recognises aliased, namespaced and spaced decorators', async () => {
    const a = write(
      'src/A.ts',
      `import { Controller as HttpController } from '@vercube/core';\n@HttpController('/a') export class AController {}`,
    );
    const b = write('src/B.ts', `import * as core from '@vercube/core';\n@core.Controller('/b') export class BController {}`);
    const c = write('src/C.ts', `@Controller ('/c') export class CController {}`);
    const e = write('src/E.ts', `import { Controller as Ctl } from '@vercube/core';\n@Ctl('/e') export class EController {}`);

    write('src/D.ts', `import * as other from 'x';\n@other.Injectable() export class DService {}`);

    expect(withoutTypes(await findControllers(root))).toEqual({
      AController: { file: a, exportName: 'AController' },
      BController: { file: b, exportName: 'BController' },
      CController: { file: c, exportName: 'CController' },
      EController: { file: e, exportName: 'EController' },
    });
  });

  it('reads a file listed twice once', async () => {
    const file = write(
      'src/Two.ts',
      `@Controller('/a') export class AController {}\n@Controller('/b') export class BController {}`,
    );

    expect(withoutTypes(await findControllers([file, file]))).toEqual({
      AController: { file, exportName: 'AController' },
      BController: { file, exportName: 'BController' },
    });
  });

  it('reads only the given files', async () => {
    const a = write('src/A.ts', `@Controller('/a') export class AController {}`);

    write('src/B.ts', `@Controller('/b') export class BController {}`);

    expect(Object.keys(await findControllers([a]))).toEqual(['AController']);
  });
});

describe('generateRouteTypes', () => {
  const out = '/app/.vercube/routes.d.ts';
  const controllers = {
    UserController: { file: '/app/src/Controllers/UserController.ts', exportName: 'UserController' },
    FeedController: { file: '/app/src/Feed.mts', exportName: 'default' },
    Hidden: { file: '/app/src/Hidden.ts', exportName: null },
    Twice: null,
  };

  it('writes sorted, argument-indexed type references', () => {
    const routes: TypegenRoute[] = [
      {
        method: 'POST',
        path: '/users',
        controller: 'UserController',
        handler: 'create',
        args: [
          { idx: 0, type: 'body' },
          { idx: 1, type: 'header', name: 'x-tenant' },
          { idx: 2, type: 'request' },
        ],
      },
      {
        method: 'GET',
        path: '/users/:id/files/**:path',
        controller: 'UserController',
        handler: 'file',
        args: [{ idx: 0, type: 'param', name: 'path' }],
      },
      {
        method: 'GET',
        path: '/users',
        controller: 'UserController',
        handler: 'list',
        args: [
          { idx: 1, type: 'query-param', name: 'sort' },
          { idx: 0, type: 'query-param', name: 'page' },
          { idx: 2, type: 'query-params' },
        ],
      },
      { method: 'HEAD', path: '/feed', controller: 'FeedController', handler: 'feed', args: [], sse: true },
      { method: 'GET', path: '/feed', controller: 'FeedController', handler: 'feed', args: [], sse: true },
      {
        method: 'POST',
        path: '/users/:id/avatar',
        controller: 'UserController',
        handler: 'upload',
        args: [
          { idx: 0, type: 'param', name: 'id' },
          { idx: 1, type: 'multipart-form-data' },
        ],
      },
    ];

    expect(generateRouteTypes({ routes, controllers, outFile: out })).toEqual({
      skipped: [],
      warnings: [],
      files: ['/app/src/Controllers/UserController.ts', '/app/src/Feed.mts'],
      code: [
        TYPEGEN_HEADER,
        '',
        "import type { RouteDef } from '@vercube/client';",
        "import type { UserController } from '../src/Controllers/UserController.js';",
        "import type FeedController from '../src/Feed.mjs';",
        '',
        'export interface VercubeRoutes {',
        "  'GET /feed': RouteDef<FeedController, 'feed', { sse: true }>;",
        "  'GET /users': RouteDef<UserController, 'list', { query: { page: 0; sort: 1 }; queries: 2 }>;",
        "  'GET /users/:id/files/**:path': RouteDef<UserController, 'file', { param: { id: null; path: 0 } }>;",
        "  'HEAD /feed': RouteDef<FeedController, 'feed', { sse: true }>;",
        "  'POST /users': RouteDef<UserController, 'create', { header: { 'x-tenant': 1 }; body: 0 }>;",
        "  'POST /users/:id/avatar': RouteDef<UserController, 'upload', { param: { id: 0 }; form: 1 }>;",
        '}',
        '',
      ].join('\n'),
    });
  });

  it('keeps the root when the path is only slashes', () => {
    const { code } = generateRouteTypes({
      routes: [{ method: 'GET', path: '//', controller: 'UserController', handler: 'a', args: [] }],
      controllers,
      outFile: out,
    });

    expect(code).toContain("'GET /': RouteDef<UserController, 'a'>;");
  });

  it('drops a trailing slash, which the router ignores', () => {
    const { code } = generateRouteTypes({
      routes: [
        { method: 'GET', path: '/users/', controller: 'UserController', handler: 'list', args: [] },
        { method: 'GET', path: '/', controller: 'UserController', handler: 'home', args: [] },
      ],
      controllers,
      outFile: out,
    });

    expect(code).toContain("'GET /users': RouteDef<UserController, 'list'>;");
    expect(code).toContain("'GET /': RouteDef<UserController, 'home'>;");
  });

  it('is independent of the order routes come in', () => {
    const routes: TypegenRoute[] = [
      { method: 'GET', path: '/b', controller: 'UserController', handler: 'b', args: [] },
      { method: 'GET', path: '/a', controller: 'FeedController', handler: 'a', args: [] },
    ];

    expect(generateRouteTypes({ routes, controllers, outFile: out }).code).toBe(
      generateRouteTypes({ routes: [...routes].reverse(), controllers, outFile: out }).code,
    );
  });

  it('skips routes it cannot import, with a reason each', () => {
    const routes: TypegenRoute[] = [
      { method: 'GET', path: '/a', controller: 'Missing', handler: 'a', args: [] },
      { method: 'GET', path: '/b', controller: 'Hidden', handler: 'b', args: [] },
      { method: 'GET', path: '/c', controller: 'Twice', handler: 'c', args: [] },
    ];
    const { code, skipped } = generateRouteTypes({ routes, controllers, outFile: out });

    expect(skipped).toEqual([
      { id: 'GET /a', reason: 'no source file found for Missing' },
      { id: 'GET /b', reason: 'Hidden is not exported from ../src/Hidden.ts' },
      { id: 'GET /c', reason: 'Twice is declared in more than one file' },
    ]);
    expect(code).toContain('export interface VercubeRoutes {\n}');
  });

  it('leaves out framework routes quietly', () => {
    const { code, skipped } = generateRouteTypes({
      routes: [
        { method: 'GET', path: '/_health/ready', controller: 'HealthController', handler: 'ready', args: [], internal: true },
        { method: 'GET', path: '/x', controller: 'Missing', handler: 'x', args: [], internal: false },
      ],
      controllers,
      outFile: out,
    });

    expect(skipped).toEqual([{ id: 'GET /x', reason: 'no source file found for Missing' }]);
    expect(code).not.toContain('_health');
  });

  it('does not type a framework route against an application class of the same name', () => {
    const { code, skipped } = generateRouteTypes({
      routes: [
        { method: 'GET', path: '/_health/ready', controller: 'UserController', handler: 'ready', args: [], internal: true },
      ],
      controllers,
      outFile: out,
    });

    expect(skipped).toEqual([]);
    expect(code).not.toContain('_health');
  });

  it('finds a controller a bundler renamed, and keeps clear of the names the file declares', () => {
    const { code, skipped } = generateRouteTypes({
      routes: [
        { method: 'GET', path: '/a', controller: 'UserController$1', handler: 'a', args: [] },
        { method: 'GET', path: '/b', controller: 'RouteDef', handler: 'b', args: [] },
      ],
      controllers: {
        UserController: controllers.UserController,
        RouteDef: { file: '/app/src/RouteDef.ts', exportName: 'RouteDef' },
      },
      outFile: out,
    });

    expect(skipped).toEqual([]);
    expect(code).toContain("import type { UserController as UserController$1 } from '../src/Controllers/UserController.js';");
    expect(code).toContain("import type { RouteDef as RouteDef_ } from '../src/RouteDef.js';");
    expect(code).toContain("'GET /b': RouteDef<RouteDef_, 'b'>;");
  });

  it('gives a reserved controller a name no other controller has', () => {
    const { code, skipped } = generateRouteTypes({
      routes: [
        { method: 'GET', path: '/a', controller: 'RouteDef', handler: 'a', args: [] },
        { method: 'GET', path: '/b', controller: 'RouteDef_', handler: 'b', args: [] },
        { method: 'GET', path: '/c', controller: 'VercubeRoutes', handler: 'c', args: [] },
        { method: 'GET', path: '/d', controller: 'VercubeRoutes_', handler: 'd', args: [] },
      ],
      controllers: {
        RouteDef: { file: '/app/src/A.ts', exportName: 'RouteDef' },
        RouteDef_: { file: '/app/src/B.ts', exportName: 'RouteDef_' },
        VercubeRoutes: { file: '/app/src/C.ts', exportName: 'VercubeRoutes' },
        VercubeRoutes_: { file: '/app/src/D.ts', exportName: 'VercubeRoutes_' },
      },
      outFile: out,
    });

    expect(skipped).toEqual([]);
    expect(code).toContain("import type { RouteDef as RouteDef__ } from '../src/A.js';");
    expect(code).toContain("import type { RouteDef_ } from '../src/B.js';");
    expect(code).toContain("import type { VercubeRoutes as VercubeRoutes__ } from '../src/C.js';");
    expect(code).toContain("import type { VercubeRoutes_ } from '../src/D.js';");
    expect(code).toContain("'GET /a': RouteDef<RouteDef__, 'a'>;");
    expect(code).toContain("'GET /b': RouteDef<RouteDef_, 'b'>;");
    expect(code).toContain("'GET /c': RouteDef<VercubeRoutes__, 'c'>;");
    expect(code).toContain("'GET /d': RouteDef<VercubeRoutes_, 'd'>;");
  });

  it('does not guess which class a renamed controller is when both names have routes', () => {
    const { code, skipped } = generateRouteTypes({
      routes: [
        { method: 'GET', path: '/a', controller: 'UserController', handler: 'a', args: [] },
        { method: 'GET', path: '/b', controller: 'UserController$1', handler: 'b', args: [] },
      ],
      controllers: { UserController: controllers.UserController },
      outFile: out,
    });

    expect(skipped).toEqual([{ id: 'GET /b', reason: 'no source file found for UserController$1' }]);
    expect(code).toContain("'GET /a': RouteDef<UserController, 'a'>;");
  });

  it('keeps a dot-named directory relative', () => {
    const { code } = generateRouteTypes({
      routes: [{ method: 'GET', path: '/a', controller: 'A', handler: 'a', args: [] }],
      controllers: { A: { file: '/app/.vercube/.hidden/A.ts', exportName: 'A' } },
      outFile: out,
    });

    expect(code).toContain("import type { A } from './.hidden/A.js';");
  });

  it('imports a re-exported controller under its class name', () => {
    const { code } = generateRouteTypes({
      routes: [{ method: 'GET', path: '/a', controller: 'AController', handler: 'a', args: [] }],
      controllers: { AController: { file: '/app/src/A.ts', exportName: 'Renamed' } },
      outFile: out,
    });

    expect(code).toContain("import type { Renamed as AController } from '../src/A.js';");
  });
});

describe('writeRouteTypes', () => {
  it('writes only when the content changed', () => {
    const file = join(root, '.vercube/routes.d.ts');

    expect(writeRouteTypes(file, 'a')).toBe(true);

    const mtime = statSync(file).mtimeMs;

    expect(writeRouteTypes(file, 'a')).toBe(false);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(writeRouteTypes(file, 'b')).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('b');
  });
});

describe('createRouteTypesWriter', () => {
  it('warns once per reason, however many routes it skipped', async () => {
    write('src/A.ts', `@Controller('/a') export class AController {}`);

    const warnings: string[] = [];
    const routes: TypegenRoute[] = [
      { method: 'GET', path: '/a', controller: 'AController', handler: 'a', args: [] },
      { method: 'GET', path: '/lib', controller: 'LibController', handler: 'a', args: [] },
      { method: 'HEAD', path: '/lib', controller: 'LibController', handler: 'a', args: [] },
      { method: 'GET', path: '/lib/x', controller: 'LibController', handler: 'x', args: [] },
      { method: 'GET', path: '/other', controller: 'OtherController', handler: 'a', args: [] },
    ];

    await createRouteTypesWriter({
      root,
      outFile: join(root, '.vercube/routes.d.ts'),
      logger: { warn: (m) => warnings.push(m) },
    })(routes);

    expect(warnings).toEqual([
      'Skipped GET /lib and 2 more routes: no source file found for LibController',
      'Skipped GET /other: no source file found for OtherController',
    ]);
  });
});

describe('resolveControllers', () => {
  it('prefers discovery, and scans the project for controllers it does not list', async () => {
    write('src/Listed.ts', `@Controller('/a') export class AController {}`);
    write('src/Other.ts', `@Controller('/a') export class AController {}`);
    const bound = write('src/Bound.ts', `@Controller('/b') export class BController {}`);
    const routes: TypegenRoute[] = [
      { method: 'GET', path: '/a', controller: 'AController', handler: 'a', args: [] },
      { method: 'GET', path: '/b', controller: 'BController', handler: 'b', args: [] },
    ];

    const found = await resolveControllers(routes, root, { root, controllers: [{ name: 'AController', path: 'src/Listed.ts' }] });

    // the scan alone would find AController twice
    expect(withoutTypes({ c: found.AController }).c).toEqual({ file: join(root, 'src/Listed.ts'), exportName: 'AController' });
    expect(withoutTypes({ c: found.BController }).c).toEqual({ file: bound, exportName: 'BController' });
  });

  it('skips a listed file that is gone and finds the controller where it moved', async () => {
    const moved = write('src/Moved.ts', `@Controller('/a') export class AController {}`);
    const routes: TypegenRoute[] = [{ method: 'GET', path: '/a', controller: 'AController', handler: 'a', args: [] }];

    const found = await resolveControllers(routes, root, { root, controllers: [{ name: 'AController', path: 'src/Gone.ts' }] });

    expect(withoutTypes({ c: found.AController }).c).toEqual({ file: moved, exportName: 'AController' });
  });
});

describe('route errors', () => {
  const route = (overrides: Partial<TypegenRoute> = {}): TypegenRoute => ({
    method: 'GET',
    path: '/users/:id',
    controller: 'UserController',
    handler: 'get',
    args: [],
    ...overrides,
  });

  async function generate(routes: TypegenRoute[], extra: Partial<Parameters<typeof generateRouteTypes>[0]> = {}) {
    return generateRouteTypes({
      routes,
      controllers: await findControllers(root),
      outFile: join(root, '.vercube/routes.d.ts'),
      ...extra,
    });
  }

  it('imports each declared error from where the controller file imports it', async () => {
    write('src/Errors/Conflict.ts', `export class ConflictError {}`);
    write('src/Errors/Gone.ts', `export default class GoneError {}`);
    write(
      'src/UserController.ts',
      [
        `import { Controller, NotFoundError as Missing } from '@vercube/core';`,
        `import { ConflictError } from './Errors/Conflict';`,
        `import Gone from './Errors/Gone.js';`,
        `import { PaymentError } from '@acme/errors';`,
        `export class LocalError {}`,
        `@Controller('/users') export class UserController {}`,
      ].join('\n'),
    );

    const { code, warnings } = await generate([
      route({
        throws: [
          { name: 'NotFoundError', status: 404 },
          { name: 'ConflictError', status: 409 },
          // `@Throws(Gone)` reports the class's own name
          { name: 'GoneError', status: 410 },
          { name: 'PaymentError', status: 402 },
          { name: 'LocalError', status: 418 },
        ],
      }),
    ]);

    expect(warnings).toEqual([]);
    expect(code).toContain(`import type { ConflictError } from '../src/Errors/Conflict.js';`);
    // a default import is typed under the class name the route table reports
    expect(code).toContain(`import type GoneError from '../src/Errors/Gone.js';`);
    expect(code).toContain(`import type { LocalError, UserController } from '../src/UserController.js';`);
    expect(code).toContain(`import type { PaymentError } from '@acme/errors';`);
    expect(code).toContain(`import type { NotFoundError } from '@vercube/core';`);
    expect(code).toContain(
      `throws: { 402: PaymentError; 404: NotFoundError; 409: ConflictError; 410: GoneError; 418: LocalError }`,
    );
  });

  it('falls back to @vercube/core for a built-in the file does not import, and to a generic type with a warning otherwise', async () => {
    write('src/UserController.ts', `class Hidden {}\n@Controller('/users') export class UserController {}`);

    const { code, warnings } = await generate([
      route({
        throws: [
          { name: 'NotFoundError', status: 404 },
          { name: 'Hidden', status: 410 },
        ],
      }),
    ]);

    expect(code).toContain(`throws: { 404: NotFoundError; 410: { name: string; message?: string } }`);
    expect(warnings).toEqual([expect.stringMatching(/^GET \/users\/:id: cannot import the type of Hidden \(410\)/)]);
  });

  it('imports an implicit error from the module core names, and joins classes sharing a status', async () => {
    write(
      'src/UserController.ts',
      `import { BadRequestError } from './MyErrors';\n@Controller('/users') export class UserController {}`,
    );
    write('src/MyErrors.ts', `export class BadRequestError {}`);

    const { code } = await generate([
      route({
        throws: [
          // core's own, whatever the controller file calls by that name
          { name: 'BadRequestError', status: 400, module: '@vercube/core' },
          { name: 'TooManyRequestsError', status: 429, module: '@acme/rate-limit' },
          { name: 'BadRequestError', status: 429 },
        ],
      }),
    ]);

    expect(code).toContain(`import type { BadRequestError } from '@vercube/core';`);
    expect(code).toContain(`import type { BadRequestError as BadRequestError_ } from '../src/MyErrors.js';`);
    expect(code).toContain(`throws: { 400: BadRequestError; 429: BadRequestError_ | TooManyRequestsError }`);
  });

  it('gives an error a name no controller has', async () => {
    write('src/UserController.ts', `@Controller('/users') export class UserController {}`);
    write(
      'src/Admin.ts',
      `import { UserController } from '@acme/errors';\n@Controller('/admin') export class AdminController {}`,
    );

    const { code } = await generate([
      route(),
      route({ path: '/admin', controller: 'AdminController', throws: [{ name: 'UserController', status: 409 }] }),
    ]);

    expect(code).toContain(`import type { UserController as UserController_ } from '@acme/errors';`);
    expect(code).toContain(`'GET /admin': RouteDef<AdminController, 'get', { throws: { 409: UserController_ } }>`);
  });

  it('warns about an error once, not on every write', async () => {
    write('src/UserController.ts', `@Controller('/users') export class UserController {}`);

    const warnings: string[] = [];
    const writer = createRouteTypesWriter({
      root,
      outFile: join(root, '.vercube/routes.d.ts'),
      logger: { warn: (m) => warnings.push(m) },
    });
    const routes = [route({ throws: [{ name: 'Unknown', status: 418 }] })];

    await writer(routes);
    await writer(routes);

    expect(warnings).toHaveLength(1);
  });

  it('resolves namespace imports, `export default` of a local class and directory index files', async () => {
    write('src/errors/index.ts', `export class GoneError {}`);
    write('src/conflict.ts', `export class ConflictError {}`);
    write(
      'src/UserController.ts',
      [
        `import * as Errors from './conflict';`,
        `import { GoneError } from './errors';`,
        `class LocalError {}`,
        `@Controller('/users') export class UserController {`,
        `  @Throws(Errors.ConflictError) get() {}`,
        `}`,
        `export default LocalError;`,
      ].join('\n'),
    );

    const { code, warnings } = await generate([
      route({
        throws: [
          { name: 'ConflictError', status: 409 },
          { name: 'GoneError', status: 410 },
          { name: 'LocalError', status: 418 },
        ],
      }),
    ]);

    expect(warnings).toEqual([]);
    expect(code).toContain(`import type { ConflictError } from '../src/conflict.js';`);
    expect(code).toContain(`import type { GoneError } from '../src/errors/index.js';`);
    expect(code).toContain(`import type LocalError from '../src/UserController.js';`);
  });

  it('does not guess between two imports of one name, or swap an unexported class for the core one', async () => {
    write(
      'src/UserController.ts',
      [
        `import { ConflictError } from '@acme/a';`,
        `import { ConflictError as Other } from '@acme/b';`,
        `class NotFoundError {}`,
        `@Controller('/users') export class UserController {}`,
      ].join('\n'),
    );

    const { code, warnings } = await generate([
      route({
        throws: [
          { name: 'NotFoundError', status: 404 },
          { name: 'ConflictError', status: 409 },
        ],
      }),
    ]);

    expect(code).toContain(`throws: { 404: { name: string; message?: string }; 409: { name: string; message?: string } }`);
    expect(code).not.toContain('@vercube/core');
    expect(warnings).toHaveLength(2);
  });

  it('looks up only names the file has, not inherited object properties', async () => {
    write(
      'src/UserController.ts',
      `import { toString } from '@acme/errors';\n@Controller('/users') export class UserController {}`,
    );

    const { code } = await generate([
      route({
        throws: [
          { name: 'toString', status: 409 },
          { name: 'constructor', status: 410 },
        ],
      }),
    ]);

    expect(code).toContain(`throws: { 409: toString; 410: { name: string; message?: string } }`);
  });

  it('names imports the same way whatever order the routes come in', async () => {
    write('src/A.ts', `import { ConflictError } from '@acme/a';\n@Controller('/a') export class AController {}`);
    write('src/B.ts', `import { ConflictError } from '@acme/b';\n@Controller('/b') export class BController {}`);

    const routes = [
      route({ path: '/a', controller: 'AController', throws: [{ name: 'ConflictError', status: 409 }] }),
      route({ path: '/b', controller: 'BController', throws: [{ name: 'ConflictError', status: 409 }] }),
    ];

    expect((await generate(routes)).code).toBe((await generate([...routes].reverse())).code);
  });

  it('reads `{ default as X }` as a default import, and never swaps an unresolved import for the core class', async () => {
    write('src/Gone.ts', `export default class GoneError {}`);
    write(
      'src/UserController.ts',
      [
        `import { default as Gone } from './Gone';`,
        `import { NotFoundError } from './missing';`,
        `@Controller('/users') export class UserController {}`,
      ].join('\n'),
    );

    const { code, warnings } = await generate([
      route({
        throws: [
          { name: 'NotFoundError', status: 404 },
          { name: 'GoneError', status: 410 },
        ],
      }),
    ]);

    expect(code).toContain(`import type GoneError from '../src/Gone.js';`);
    expect(code).toContain(`throws: { 404: { name: string; message?: string }; 410: GoneError }`);
    expect(code).not.toContain('@vercube/core');
    expect(warnings).toHaveLength(1);
  });
});
