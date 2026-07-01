import { createRequire } from 'node:module';
import { loadRunner, RunnerManager } from 'env-runner';
import { isAbsolute, resolve } from 'pathe';
import { devWorker } from './meta';
import { VERCUBE_ENV } from './types';
import type { VercubePluginContext } from './types';
import type { RunnerName } from 'env-runner';
import type { EnvironmentOptions } from 'vite';

/**
 * Runtime dependencies of `@vercube/*` packages. When the framework is bundled
 * into `dist/index.mjs`, these imports surface at the bundle top level and must
 * be bundled too — pnpm does not hoist them to the app root.
 */
export const FRAMEWORK_RUNTIME_DEPS: (string | RegExp)[] = [
  /^srvx/,
  'rou3',
  'c12',
  'defu',
  'pathe',
  'evlog',
  /^evlog\//,
  '@standard-schema/spec',
];

/**
 * Default `resolve.noExternal` / production bundle patterns. `@vercube/*` must stay in
 * a single module graph so class-reference DI tokens (e.g. `RequestContext`) are not
 * duplicated between the app, plugins, and framework.
 */
export const DEFAULT_NO_EXTERNAL: (string | RegExp)[] = [/^@vercube\//, ...FRAMEWORK_RUNTIME_DEPS];

/** Vercube packages that must resolve to a single module id (class-reference DI tokens). */
export const VERCUBE_PACKAGES = ['@vercube/core', '@vercube/di', '@vercube/auth', '@vercube/logger', '@vercube/schema'] as const;

/**
 * Canonical entry paths for `@vercube/*` packages from the consuming app's root.
 * Prevents the production bundler from inlining duplicate copies when workspace
 * links and `node_modules` paths both appear in the graph.
 */
export function createVercubeResolveAliases(root: string): Record<string, string> {
  const require = createRequire(resolve(root, 'package.json'));
  const aliases: Record<string, string> = {};

  for (const name of VERCUBE_PACKAGES) {
    try {
      aliases[name] = require.resolve(name);
    } catch {
      // Optional in apps that do not depend on every package directly.
    }
  }

  return aliases;
}

/** @deprecated Use {@link DEFAULT_NO_EXTERNAL}. */
export const DEV_NO_EXTERNAL = DEFAULT_NO_EXTERNAL;

/**
 * Merges built-in {@link DEFAULT_NO_EXTERNAL} with optional plugin patterns.
 *
 * @param extra - Additional patterns from {@link VercubePluginConfig.noExternal}.
 * @returns Patterns for dev `resolve.noExternal` and production bundling.
 */
export function resolveNoExternalPatterns(extra?: (string | RegExp)[]): (string | RegExp)[] {
  if (!extra?.length) {
    return DEFAULT_NO_EXTERNAL;
  }
  return [...DEFAULT_NO_EXTERNAL, ...extra];
}

/** @deprecated Use {@link resolveNoExternalPatterns}. */
export const resolveDevNoExternal = resolveNoExternalPatterns;

/**
 * The custom message event used to tell the worker which entry an environment loads.
 */
export const VITE_ENV_EVENT = 'vercube:vite-env';

/**
 * Builds the Vite environment options for the Vercube server environment.
 *
 * In dev, `createEnvironment` returns a {@link FetchableDevEnvironment} backed by
 * the env-runner worker. In build, the environment bundles the virtual server
 * entry (wired up in the production milestone).
 *
 * @param ctx - The shared plugin context.
 * @returns The environment options for the `vercube` environment.
 */
export function createVercubeEnvironment(ctx: VercubePluginContext): EnvironmentOptions {
  const noExternal = resolveNoExternalPatterns(ctx.pluginConfig.noExternal);

  return {
    consumer: 'server',
    // Class references are DI tokens — every module that shares a token (framework,
    // app, plugins such as `@enp/auth`) must resolve to the same class identity.
    // Production bundles the full server dependency graph (see createProdExternal).
    resolve: ctx.dev ? { noExternal } : {},
    build: {
      outDir: resolve(ctx.root, 'dist'),
      emptyOutDir: false,
      copyPublicDir: false,
      rollupOptions: {
        input: { index: ctx.serverEntry },
        external: isBareSpecifier,
        output: { entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs', format: 'es' },
      },
    },
    dev: {
      createEnvironment: async (envName, envConfig) => {
        const { createFetchableDevEnvironment } = await import('./dev');
        const env = createFetchableDevEnvironment(envName, envConfig, getEnvRunner(ctx), ctx.serverEntry);
        (ctx._viteEnvs ??= new Map()).set(envName, ctx.serverEntry);
        return env;
      },
    },
  };
}

/**
 * Initializes the env-runner manager that drives the dev worker. Idempotent and
 * concurrency-safe: repeated calls return the same manager. On unexpected worker
 * exit the runner is reloaded up to three times before giving up.
 *
 * @param ctx - The shared plugin context.
 * @returns The initialized runner manager.
 */
export async function initEnvRunner(ctx: VercubePluginContext): Promise<RunnerManager> {
  if (ctx._envRunner) {
    return ctx._envRunner;
  }
  if (!ctx._initPromise) {
    ctx._initPromise = (async () => {
      const manager = new RunnerManager();
      let retries = 0;

      manager.onClose((_runner, cause) => {
        if (retries++ < 3) {
          void loadRunnerInto(ctx, manager);
        } else {
          console.error('[vercube] env runner failed after 3 retries.', cause ? `Last cause: ${cause}` : '');
        }
      });

      manager.onReady(() => {
        retries = 0;
        if (ctx._viteEnvs) {
          for (const [name, entry] of ctx._viteEnvs) {
            manager.sendMessage({ type: 'custom', event: VITE_ENV_EVENT, data: { name, entry } });
          }
        }
      });

      await loadRunnerInto(ctx, manager);
      ctx._envRunner = manager;
      return manager;
    })().finally(() => {
      // Clear the cached promise once it settles. On success the `_envRunner`
      // guard above short-circuits future calls; on failure this lets callers
      // retry instead of being stuck with the same rejected promise.
      ctx._initPromise = undefined;
    });
  }
  return ctx._initPromise;
}

/**
 * Returns the initialized runner manager, throwing if {@link initEnvRunner} has not run.
 *
 * @param ctx - The shared plugin context.
 * @returns The runner manager.
 */
export function getEnvRunner(ctx: VercubePluginContext): RunnerManager {
  if (!ctx._envRunner) {
    throw new Error('[vercube] Env runner not initialized. Call initEnvRunner() first.');
  }
  return ctx._envRunner;
}

/**
 * Reloads the worker behind the runner manager, re-importing all environment entries.
 *
 * @param ctx - The shared plugin context.
 * @returns The runner manager.
 */
export async function reloadEnvRunner(ctx: VercubePluginContext): Promise<RunnerManager> {
  const manager = ctx._envRunner;
  if (!manager) {
    return initEnvRunner(ctx);
  }
  await loadRunnerInto(ctx, manager);
  return manager;
}

/**
 * Returns true for bare module specifiers (npm/workspace packages), which the
 * production build externalizes. Relative paths, absolute paths, virtual
 * (`\0`-prefixed) ids, Vite path aliases (`@/…`), and bundler helper runtimes
 * are bundled.
 *
 * @param id - The import specifier to classify.
 * @returns Whether the specifier is a bare dependency.
 */
export function isBareSpecifier(id: string): boolean {
  if (id.startsWith('\0') || id.startsWith('.') || isAbsolute(id)) {
    return false;
  }

  // `@/foo` is a path alias (`@` → src), not `@scope/pkg`. `@oxc-project/*` is
  // injected by the transform pipeline and is not a runtime dependency.
  if (id.startsWith('@/') || id.startsWith('@oxc-project/')) {
    return false;
  }

  return true;
}

/**
 * Returns whether `id` matches any {@link resolveNoExternalPatterns} entry.
 */
export function matchesNoExternal(id: string, patterns: (string | RegExp)[]): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (id === pattern || id.startsWith(`${pattern}/`)) {
        return true;
      }
      continue;
    }

    if (pattern.test(id)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts the npm package name from an absolute `node_modules` file path.
 */
export function extractPackageName(filePath: string): string | null {
  const marker = 'node_modules/';
  const idx = filePath.lastIndexOf(marker);
  if (idx === -1) {
    return null;
  }

  const rest = filePath.slice(idx + marker.length);
  if (rest.startsWith('@')) {
    const parts = rest.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }

  return rest.split('/')[0] ?? null;
}

/**
 * True when `importer` belongs to a package matched by {@link resolveNoExternalPatterns}.
 */
export function isFromBundledPackage(importer: string | undefined, patterns: (string | RegExp)[]): boolean {
  if (!importer) {
    return false;
  }

  const packageName = extractPackageName(importer);
  return packageName ? matchesNoExternal(packageName, patterns) : false;
}

/**
 * Rollup `external` predicate for the production server bundle. Bundles path
 * aliases, app sources, packages covered by {@link resolveNoExternalPatterns},
 * and their transitive dependencies so DI class tokens are not duplicated and
 * pnpm cannot leave nested deps (e.g. `srvx`) unresolved at runtime.
 */
export function createProdExternal(extra?: (string | RegExp)[]): (id: string, importer?: string) => boolean {
  const bundlePatterns = resolveNoExternalPatterns(extra);

  return (id: string, importer?: string) => {
    if (!isBareSpecifier(id)) {
      return false;
    }

    if (matchesNoExternal(id, bundlePatterns)) {
      return false;
    }

    if (isFromBundledPackage(importer, bundlePatterns)) {
      return false;
    }

    return true;
  };
}

/**
 * Loads (or reloads) the configured runner into the manager.
 */
async function loadRunnerInto(ctx: VercubePluginContext, manager: RunnerManager): Promise<void> {
  const runnerName = (ctx.pluginConfig.runner || process.env.VERCUBE_DEV_RUNNER || 'node-worker') as RunnerName;
  const runner = await loadRunner(runnerName, { name: VERCUBE_ENV, data: { entry: devWorker } });
  await manager.reload(runner);
}
