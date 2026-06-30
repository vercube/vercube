import { existsSync } from 'node:fs';
import { scanSource } from '@vercube/scan';
import { isAbsolute, resolve } from 'pathe';
import { writeServerEntry } from './entry';
import type { VercubePluginConfig, VercubePluginContext } from './types';

const DEFAULT_SCAN_DIRS = ['src'];

/** Location of the generated server entry, kept inside node_modules so it stays out of source control and file watchers. */
const SERVER_ENTRY_REL = 'node_modules/.vercube/server-entry.mjs';

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
    serverEntry: resolve(root, SERVER_ENTRY_REL),
    dev: true,
    hasClient: false,
    controllers: [],
    routes: [],
    services: [],
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
  ctx.serverEntry = resolve(ctx.root, SERVER_ENTRY_REL);
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
  const { controllers, routes, services } = await scanSource({ dirs: ctx.scanDirs });
  ctx.controllers = controllers;
  ctx.routes = routes;
  ctx.services = services;
  writeServerEntry(ctx);
}

/**
 * Resolves `target` against `base` when it is relative, leaving absolute paths untouched.
 */
function resolveFrom(base: string, target: string): string {
  return isAbsolute(target) ? target : resolve(base, target);
}
