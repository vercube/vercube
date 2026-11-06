// Type-checking cost of a large route map.
//
// Writes a fixture with N routes (default 500) over N/10 controllers, one call
// per route, and runs `tsc --extendedDiagnostics` on it.
//
// With `--errors`, every route also gets the `throws` map the generator writes
// (a declared 404, the implicit 400 of a body, the 401 and 403 of a secured route).
//
// With `--safe`, every call goes through `api.safe` and reads the error status,
// which is what makes the compiler build each route's error union.
//
//   node packages/client/scripts/type-perf.mjs [routes] [--errors] [--safe]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const errors = args.includes('--errors');
const safe = args.includes('--safe');
const total = Number(args.find((arg) => !arg.startsWith('--')) ?? 500);
/** `; throws: { ... }` for a route, when errors are measured. */
const throws = (map) => (errors ? `; throws: { ${map} }` : '');
const root = resolve(import.meta.dirname, '../../..');
// inside the repo, so `tslib` and the workspace packages resolve
const dir = join(root, 'packages/client/node_modules/.type-perf');

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const controllers = [];
const entries = [];
const calls = [];

const controllerCount = Math.ceil(total / 10);

for (let c = 0; c < controllerCount; c++) {
  const methods = [];

  // the last controller holds what is left when `total` is not a multiple of ten
  for (let m = 0; m < Math.min(10, total - c * 10); m++) {
    const n = c * 10 + m;

    switch (m % 5) {
      case 0: {
        methods.push(
          `  @Get('/r${n}/:id') public h${m}(@Param('id') id: string): Promise<{ id: string; at: Date; n: ${n} }> { return null!; }`,
        );
        entries.push(`  'GET /c${c}/r${n}/:id': RouteDef<C${c}, 'h${m}', { param: { id: 0 }${throws('404: NotFoundError')} }>;`);
        calls.push(`  await api.get('/c${c}/r${n}/:id', { params: { id: '1' } });`);
        break;
      }
      case 1: {
        methods.push(
          `  @Get('/r${n}') public h${m}(@QueryParam({ name: 'page' }) page: number | undefined, @QueryParam({ name: 'sort' }) sort: 'a' | 'b'): { items: { id: string }[] } { return null!; }`,
        );
        entries.push(
          `  'GET /c${c}/r${n}': RouteDef<C${c}, 'h${m}', { query: { page: 0; sort: 1 }${throws('401: UnauthorizedError; 403: ForbiddenError')} }>;`,
        );
        calls.push(`  await api.get('/c${c}/r${n}', { query: { sort: 'a' } });`);
        break;
      }
      case 2: {
        methods.push(
          `  @Post('/r${n}') public h${m}(@Body() body: { name: string; tags: string[] }): { ok: true } { return null!; }`,
        );
        entries.push(`  'POST /c${c}/r${n}': RouteDef<C${c}, 'h${m}', { body: 0${throws('400: BadRequestError')} }>;`);
        calls.push(`  await api.post('/c${c}/r${n}', { body: { name: 'x', tags: [] } });`);
        break;
      }
      case 3: {
        methods.push(
          `  @Put('/r${n}/:id') public h${m}(@Param('id') id: string, @Body() body: { name?: string }, @Header('x-t') t: string): void {}`,
        );
        entries.push(
          `  'PUT /c${c}/r${n}/:id': RouteDef<C${c}, 'h${m}', { param: { id: 0 }; body: 1; header: { 'x-t': 2 }${throws('400: BadRequestError; 404: NotFoundError')} }>;`,
        );
        calls.push(`  await api.put('/c${c}/r${n}/:id', { params: { id: '1' }, body: {}, headers: { 'x-t': 'a' } });`);
        break;
      }
      default: {
        methods.push(`  @Delete('/r${n}/:id') public h${m}(): Response { return null!; }`);
        entries.push(`  'DELETE /c${c}/r${n}/:id': RouteDef<C${c}, 'h${m}', { param: { id: null } }>;`);
        calls.push(`  await api.delete('/c${c}/r${n}/:id', { params: { id: 1 } });`);
      }
    }
  }

  controllers.push(`@Controller('/c${c}')\nexport class C${c} {\n${methods.join('\n')}\n}`);
}

writeFileSync(
  join(dir, 'controllers.ts'),
  `import { Body, Controller, Delete, Get, Header, Param, Post, Put, QueryParam } from '@vercube/core';\n\n${controllers.join('\n\n')}\n`,
);
writeFileSync(
  join(dir, 'routes.ts'),
  `import type { RouteDef } from '@vercube/client';\nimport type { BadRequestError, NotFoundError, UnauthorizedError, ForbiddenError } from '@vercube/core';\nimport type { ${Array.from({ length: controllerCount }, (_, c) => `C${c}`).join(', ')} } from './controllers';\n\nexport interface VercubeRoutes {\n${entries.join('\n')}\n}\n`,
);
writeFileSync(
  join(dir, 'calls.ts'),
  `import { createClient } from '@vercube/client';\nimport type { VercubeRoutes } from './routes';\n\nconst api = createClient<VercubeRoutes>();\n\nexport async function run(): Promise<void> {\n${(safe
    ? calls.map((call, i) => call.replace('await api.', `const r${i} = await api.safe.`) + ` void r${i}.error?.status;`)
    : calls
  ).join('\n')}\n}\n`,
);

/**
 * @param files - Fixture files to check
 * @returns The diagnostics tsc reports
 */
function check(files) {
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      extends: join(root, 'tsconfig.json'),
      compilerOptions: { rootDir: '/', noEmit: true, types: ['node'] },
      // the root config's `include` would add the whole repository to both runs
      include: [],
      files: files.map((f) => join(dir, f)),
    }),
  );

  const out = execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(dir, 'tsconfig.json'), '--extendedDiagnostics'], {
    encoding: 'utf8',
  });
  const read = (label) => Number(out.match(new RegExp(`${label}:\\s+([\\d.]+)`))[1]);

  return { instantiations: read('Instantiations'), types: read('Types'), check: read('Check time'), memory: read('Memory used') };
}

try {
  // the controllers alone are the baseline: what is left is the client's cost
  const base = check(['controllers.ts']);
  const full = check(['controllers.ts', 'routes.ts', 'calls.ts']);

  console.log(
    `${total} routes${errors ? ' with errors' : ''}, one ${safe ? 'safe ' : ''}call each (client cost = full - controllers only)`,
  );
  console.table({
    'controllers only': base,
    full,
    'client cost': {
      instantiations: full.instantiations - base.instantiations,
      types: full.types - base.types,
      check: Number((full.check - base.check).toFixed(3)),
      memory: full.memory - base.memory,
    },
  });
} catch (error) {
  console.error(error.stdout || error);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
