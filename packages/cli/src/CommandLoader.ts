import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { loadVercubeConfig } from '@vercube/core';
import { createJiti } from 'jiti';

/** @internal */
const _require = createRequire(import.meta.url);

/**
 * Babel (used by jiti) emits `_initializerWarningHelper` for decorated properties
 * without an explicit initializer - a function that always throws.
 * Our decorators (`@Arg`, `@Flag`, `@Inject`) already define the property via
 * `Object.defineProperty`, so the guard is unnecessary. We patch it out with a no-op.
 *
 * @see https://github.com/babel/babel/issues/12672
 */
const INIT_WARNING_HELPER_RE = /function _initializerWarningHelper\b[^{]*\{[^}]*\}/g;

/**
 * jiti's bundled Babel transform, resolved via jiti's package.json because
 * `jiti/dist/babel.cjs` is not listed in the package exports map.
 */
const babelTransform: (opts: any) => { code: string } = _require(
  resolve(dirname(_require.resolve('jiti/package.json')), 'dist/babel.cjs'),
);

/**
 * Custom jiti instance with a patched Babel transform that replaces
 * `_initializerWarningHelper` with a no-op so user command classes
 * don't need `!` or explicit default values on decorated properties.
 */
const jiti = createJiti(import.meta.url, {
  // Disable caches so our transform always runs - without this, jiti returns
  // files from Node's require cache (populated by c12's own internal jiti)
  // and the patched transform is never applied.
  fsCache: false,
  moduleCache: false,
  transform(opts: any) {
    const result = babelTransform(opts);
    return {
      code: result.code.replace(INIT_WARNING_HELPER_RE, 'function _initializerWarningHelper(){return void 0}'),
    };
  },
});

/**
 * Loads user-defined command classes from `vercube.config.ts` in the given directory.
 * Delegates file loading to the patched jiti instance so decorated properties
 * work without `!` or explicit initializers.
 *
 * Returns an empty array when:
 * - `vercube.config.ts` does not exist in `cwd`
 * - the config file has no `cli.commands` and no plugin registered commands
 *
 * @param cwd - directory to look for `vercube.config.ts` in (typically `process.cwd()`)
 * @returns array of command class constructors, or `[]` if none found
 */
export async function loadUserCommands(cwd: string): Promise<(new () => unknown)[]> {
  try {
    const config = await loadVercubeConfig(undefined, {
      cwd,
      import: (id) => jiti.import(id),
    });
    return config.cli?.commands ?? [];
  } catch {
    return [];
  }
}
