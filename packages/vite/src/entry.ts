import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'pathe';
import type { VercubePluginContext } from './types';

/**
 * Generates the source of the server entry module.
 *
 * The module creates a Vercube app, binds every auto-discovered controller and
 * service into its DI container, runs the optional setup file, flushes the
 * container queue (which registers routes via decorator initialization), and
 * exports the app's `fetch` handler. Imports and binds are deduplicated by class
 * name.
 *
 * The entry is written to a real file rather than served as a `\0`-virtual
 * module: Vite resolves bare imports from virtual modules inconsistently with
 * those from project files, which would load framework packages twice and break
 * Vercube's class-reference DI tokens. A real on-disk module resolves its
 * imports the same way the controllers do, keeping a single instance of each.
 *
 * @param ctx - The plugin context holding discovered controllers/services.
 * @returns The generated module source.
 */
export function generateServerEntry(ctx: VercubePluginContext): string {
  const discovered = [...ctx.controllers, ...ctx.services];

  // Deduplicate import statements and bindings by class name.
  const imports = new Map<string, string>();
  for (const entry of discovered) {
    if (!imports.has(entry.importClassName)) {
      imports.set(entry.importClassName, entry.import);
    }
  }

  const lines: string[] = [
    ctx.hasClient
      ? `import { createApp, HttpServer, serveStaticFiles } from '@vercube/core';`
      : `import { createApp } from '@vercube/core';`,
  ];

  if (ctx.hasClient) {
    lines.push(`import { fileURLToPath } from 'node:url';`);
  }
  if (ctx.setupFile) {
    lines.push(`import __vercubeSetup__ from ${JSON.stringify(ctx.setupFile)};`);
  }

  lines.push(...imports.values(), '');

  // The setup hook runs before the app initializes — early enough to register
  // plugins (`app.addPlugin`), mount storage, or bind interface→implementation
  // tokens that auto-discovery can't infer. It also wires the production static
  // server (see below). Auto-discovered controllers/services are bound
  // afterwards; flushing the queue then registers their routes via decorators.
  const setupBody: string[] = [];
  if (ctx.setupFile) {
    setupBody.push('  await __vercubeSetup__(app);');
  }
  if (ctx.hasClient) {
    // Plugins must be registered before `app.init()` wires the srvx server.
    setupBody.push(
      '  if (import.meta.main) {',
      "    const dir = fileURLToPath(new URL('./public', import.meta.url));",
      '    app.container.get(HttpServer).addPlugin(serveStaticFiles(dir));',
      '  }',
    );
  }

  if (setupBody.length > 0) {
    lines.push('const app = await createApp({ setup: async (app) => {', ...setupBody, '} });', '');
  } else {
    lines.push('const app = await createApp();', '');
  }

  lines.push(...[...imports.keys()].map((name) => `app.container.bind(${name});`), '');

  lines.push('app.container.flushQueue();', '');
  // Run-directly support: `node dist/index.mjs` starts listening. In dev the
  // worker imports this module (not the entrypoint), so `import.meta.main` is
  // false and only the exported `fetch` is used.
  if (ctx.hasClient) {
    lines.push(
      'if (import.meta.main) {',
      "  const dir = fileURLToPath(new URL('./public', import.meta.url));",
      '  app.container.get(HttpServer).enableSpaFallback(dir);',
      '  await app.listen();',
      '}',
      '',
    );
  } else {
    lines.push('if (import.meta.main) {', '  await app.listen();', '}', '');
  }
  lines.push('export const fetch = app.fetch.bind(app);', '');
  // WebSocket upgrades in dev: the worker forwards raw Node upgrade events here.
  // `@vercube/ws` installs the handler on `globalThis` when its plugin is used;
  // otherwise this is a no-op.
  lines.push('export const handleUpgrade = (req, socket, head) => globalThis.__vercube_ws_upgrade__?.(req, socket, head);', '');

  return lines.join('\n');
}

/**
 * Writes the generated server entry to {@link VercubePluginContext.serverEntry},
 * creating the parent directory if needed.
 *
 * @param ctx - The plugin context.
 */
export function writeServerEntry(ctx: VercubePluginContext): void {
  mkdirSync(dirname(ctx.serverEntry), { recursive: true });
  writeFileSync(ctx.serverEntry, generateServerEntry(ctx), 'utf8');
}
