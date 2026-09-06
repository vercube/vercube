import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(rootDir, '..');
const packagesDir = resolve(repoRoot, 'packages');

/** One entry of the resolver's alias table. */
interface SourceAlias {
  find: string;
  replacement: string;
}

/**
 * Maps every entry point the workspace packages publish onto the source file
 * behind it, so the playground runs against `src` instead of built output.
 *
 * The mapping is read out of each package's `exports` rather than guessed from
 * the specifier: a subpath is lowercase while the file behind it usually is not
 * (`@vercube/logger/toolkit` is `src/Toolkit.ts`), and some do not correspond at
 * all (`@vercube/nitro/runtime/handler` is `src/runtime/RouteHandler.ts`).
 * Guessing works on a case-insensitive filesystem and silently stops working on
 * Linux, which is where CI runs.
 *
 * @returns One alias per published entry point, longest specifier first
 */
function sourceAliases(): SourceAlias[] {
  const aliases: SourceAlias[] = [];

  for (const name of readdirSync(packagesDir)) {
    const packageDir = resolve(packagesDir, name);
    let manifest: { name?: string; exports?: Record<string, unknown> };

    try {
      manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }

    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      const file = typeof target === 'string' ? target : ((target as Record<string, string>)?.import ?? '');

      if (!manifest.name || !file.startsWith('./dist/') || !file.endsWith('.mjs')) {
        continue;
      }

      aliases.push({
        find: `${manifest.name}${subpath.slice(1)}`,
        replacement: resolve(packageDir, file.replace('./dist/', 'src/').replace(/\.mjs$/, '.ts')),
      });
    }
  }

  // Vite matches a string `find` as a prefix, so `@vercube/logger` would swallow
  // `@vercube/logger/toolkit` if it came first.
  return aliases.sort((a, b) => b.find.length - a.find.length);
}

export default defineConfig({
  root: rootDir,
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: sourceAliases(),
  },
});
