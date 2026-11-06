// Type-checking cost of a large route map.
//
// Writes a fixture with N routes (default 500) over N/10 controllers, one call
// per route, and runs `tsc --extendedDiagnostics` on it.
//
//   node packages/client/scripts/type-perf.mjs [routes]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const total = Number(process.argv[2] ?? 500);
const root = resolve(import.meta.dirname, '../../..');
// inside the repo, so `tslib` and the workspace packages resolve
const dir = join(root, 'packages/client/node_modules/.type-perf');

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const controllers = [];
const entries = [];
const calls = [];

for (let c = 0; c < total / 10; c++) {
  const methods = [];

  for (let m = 0; m < 10; m++) {
    const n = c * 10 + m;

    switch (m % 5) {
      case 0: {
        methods.push(
          `  @Get('/r${n}/:id') public h${m}(@Param('id') id: string): Promise<{ id: string; at: Date; n: ${n} }> { return null!; }`,
        );
        entries.push(`  'GET /c${c}/r${n}/:id': RouteDef<C${c}, 'h${m}', { param: { id: 0 } }>;`);
        calls.push(`  await api.get('/c${c}/r${n}/:id', { params: { id: '1' } });`);
        break;
      }
      case 1: {
        methods.push(
          `  @Get('/r${n}') public h${m}(@QueryParam({ name: 'page' }) page: number | undefined, @QueryParam({ name: 'sort' }) sort: 'a' | 'b'): { items: { id: string }[] } { return null!; }`,
        );
        entries.push(`  'GET /c${c}/r${n}': RouteDef<C${c}, 'h${m}', { query: { page: 0; sort: 1 } }>;`);
        calls.push(`  await api.get('/c${c}/r${n}', { query: { sort: 'a' } });`);
        break;
      }
      case 2: {
        methods.push(
          `  @Post('/r${n}') public h${m}(@Body() body: { name: string; tags: string[] }): { ok: true } { return null!; }`,
        );
        entries.push(`  'POST /c${c}/r${n}': RouteDef<C${c}, 'h${m}', { body: 0 }>;`);
        calls.push(`  await api.post('/c${c}/r${n}', { body: { name: 'x', tags: [] } });`);
        break;
      }
      case 3: {
        methods.push(
          `  @Put('/r${n}/:id') public h${m}(@Param('id') id: string, @Body() body: { name?: string }, @Header('x-t') t: string): void {}`,
        );
        entries.push(`  'PUT /c${c}/r${n}/:id': RouteDef<C${c}, 'h${m}', { param: { id: 0 }; body: 1; header: { 'x-t': 2 } }>;`);
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
  `import type { RouteDef } from '@vercube/client';\nimport type { ${Array.from({ length: total / 10 }, (_, c) => `C${c}`).join(', ')} } from './controllers';\n\nexport interface VercubeRoutes {\n${entries.join('\n')}\n}\n`,
);
writeFileSync(
  join(dir, 'calls.ts'),
  `import { createClient } from '@vercube/client';\nimport type { VercubeRoutes } from './routes';\n\nconst api = createClient<VercubeRoutes>();\n\nexport async function run(): Promise<void> {\n${calls.join('\n')}\n}\n`,
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
      compilerOptions: { rootDir: '/', noEmit: true },
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

  console.log(`${total} routes, one call each (client cost = full - controllers only)`);
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
