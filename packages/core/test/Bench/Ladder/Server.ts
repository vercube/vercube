/**
 * Starts the ladder application on a real socket. Spawned by `Run.ts` under
 * Node, Bun or Deno.
 *
 * Environment:
 * - `BENCH_CORE`: path of the `@vercube/core` build to measure (default: `packages/core/dist/index.mjs`)
 * - `BENCH_VARIANT`: `bare` or `default`
 * - `BENCH_PORT`: port to listen on
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const corePath = resolve(process.env.BENCH_CORE ?? resolve(here, '../../../dist/index.mjs'));
const variant = process.env.BENCH_VARIANT === 'default' ? 'default' : 'bare';
const port = Number(process.env.BENCH_PORT ?? 3200);

const globals = globalThis as { Bun?: unknown; Deno?: unknown };
let runtime: 'node' | 'bun' | 'deno' = 'node';

if (globals.Bun) {
  runtime = 'bun';
} else if (globals.Deno) {
  runtime = 'deno';
}

// Loaded by path: the build under test is chosen at run time, and zod is a
// dependency of the core package rather than of the workspace root.
const core = await import(pathToFileURL(corePath).href);
const zod = await import(pathToFileURL(createRequire(resolve(here, '../../../package.json')).resolve('zod')).href);
const ladder = await import(pathToFileURL(resolve(here, 'Ladder.ts')).href);

const app = await ladder.createLadderApp(core, zod.z, { variant, runtime, port });

await app.listen();
