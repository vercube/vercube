import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRouteTypesWriter, findControllers, generateRouteTypes, TYPEGEN_HEADER, writeRouteTypes } from '../src/Typegen';
import type { TypegenRoute } from '../src/Typegen';

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `vercube-typegen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

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

    expect(await findControllers(root)).toEqual({
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

    expect(await findControllers(root)).toEqual({ XController: null });
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
      files: ['/app/src/Controllers/UserController.ts', '/app/src/Feed.mts'],
      code: [
        TYPEGEN_HEADER,
        '',
        "import type { RouteDef } from '@vercube/client';",
        "import type { UserController } from '../src/Controllers/UserController';",
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

  it('imports a re-exported controller under its class name', () => {
    const { code } = generateRouteTypes({
      routes: [{ method: 'GET', path: '/a', controller: 'AController', handler: 'a', args: [] }],
      controllers: { AController: { file: '/app/src/A.ts', exportName: 'Renamed' } },
      outFile: out,
    });

    expect(code).toContain("import type { Renamed as AController } from '../src/A';");
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
