import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { scanSource } from '@vercube/scan';
import { isAbsolute, resolve } from 'pathe';
import { writeServerEntry } from './entry';
import type { VercubePluginConfig, VercubePluginContext } from './types';

const DEFAULT_SCAN_DIRS = ['src'];

/** Build output directory (relative to root) for the frontend client, served by the built server in production. */
export const CLIENT_OUT_DIR = 'dist/public';

/**
 * Creates the initial plugin context from user configuration. Directories are
 * left unresolved until {@link setupContext}, which has access to Vite's root.
 *
 * @param pluginConfig - The user-provided plugin configuration.
 * @returns A fresh, uninitialized plugin context.
 */
export function createContext(pluginConfig: VercubePluginConfig): VercubePluginContext {
  const root = pluginConfig.rootDir ?? process.cwd();
  return {
    pluginConfig,
    root,
    scanDirs: [],
    serverEntry: serverEntryPath(root),
    dev: true,
    hasClient: false,
    controllers: [],
    routes: [],
    services: [],
    middlewares: [],
  };
}

/**
 * Resolves the project root, scan directories and setup file against Vite's
 * configuration, runs an initial source scan, and writes the server entry.
 *
 * @param ctx - The plugin context to populate.
 * @param options - Resolution inputs derived from Vite's config.
 */
export async function setupContext(ctx: VercubePluginContext, options: { root: string; dev: boolean }): Promise<void> {
  ctx.root = ctx.pluginConfig.rootDir ? resolveFrom(options.root, ctx.pluginConfig.rootDir) : options.root;
  ctx.dev = options.dev;
  ctx.serverEntry = serverEntryPath(ctx.root);
  // A project with an `index.html` has a frontend Vite serves in dev; the built
  // server then serves it from `CLIENT_OUT_DIR` in production.
  ctx.hasClient = existsSync(resolve(ctx.root, 'index.html'));

  const dirs = ctx.pluginConfig.scanDirs ?? DEFAULT_SCAN_DIRS;
  ctx.scanDirs = dirs.map((dir) => resolveFrom(ctx.root, dir));

  ctx.setupFile = ctx.pluginConfig.setupFile ? resolveFrom(ctx.root, ctx.pluginConfig.setupFile) : undefined;

  await scanProject(ctx);
}

/**
 * Re-scans the project source for controllers and services, then rewrites the
 * server entry. Called on startup and whenever watched scan directories change.
 *
 * @param ctx - The plugin context to refresh.
 */
export async function scanProject(ctx: VercubePluginContext): Promise<void> {
  const { controllers, routes, services, middlewares } = await scanSource({ dirs: ctx.scanDirs });
  ctx.controllers = controllers;
  ctx.routes = routes;
  ctx.services = services;
  ctx.middlewares = middlewares;
  writeServerEntry(ctx);
}

/**
 * Location of the generated server entry, kept inside node_modules so it stays
 * out of source control and file watchers.
 *
 * The file name carries a hash of the project root. The entry imports discovered
 * classes by absolute path, so two dev servers reaching one checkout through
 * different paths (the host and a container with the project mounted at
 * `/var/www`) would otherwise overwrite each other's entry, and whichever reloads
 * next would import paths that do not exist on its side.
 *
 * @param root - The absolute project root.
 * @returns The absolute path of the server entry for that root.
 */
function serverEntryPath(root: string): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 8);
  return resolve(root, `node_modules/.vercube/server-entry.${hash}.mjs`);
}

/**
 * Resolves `target` against `base` when it is relative, leaving absolute paths untouched.
 */
function resolveFrom(base: string, target: string): string {
  return isAbsolute(target) ? target : resolve(base, target);
}
