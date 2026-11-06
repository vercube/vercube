import { existsSync } from 'node:fs';
import { createRouteTypesWriter, INSPECT_TIMEOUT, inspectEntry, resolveTypegenOutput } from '@vercube/scan';
import { resolve } from 'pathe';
import { VERCUBE_ENV } from './types';
import type { VercubePluginContext } from './types';
import type { ViteBuilder } from 'vite';

/**
 * Production build orchestration for the `buildApp` hook.
 *
 * Builds every other configured environment first (for example a frontend
 * client added by another Vite plugin), then the Vercube server environment:
 * its generated entry is bundled to `dist/index.mjs`, exporting `fetch` and
 * starting a listener when run directly (`node dist/index.mjs`).
 *
 * @param ctx - The shared plugin context.
 * @param builder - Vite's builder, providing access to the configured environments.
 */
export async function buildEnvironments(ctx: VercubePluginContext, builder: ViteBuilder): Promise<void> {
  const server = builder.environments[VERCUBE_ENV];
  if (!server) {
    throw new Error(`[vercube] Environment "${VERCUBE_ENV}" is not configured.`);
  }

  // Build other environments (e.g. a frontend client) before the server. The
  // default `client` environment builds from `index.html`, which Vite resolves
  // implicitly, so it is built whenever an `index.html` is present even though
  // its `rollupOptions.input` is not set explicitly.
  for (const [name, env] of Object.entries(builder.environments)) {
    if (name === VERCUBE_ENV) {
      continue;
    }
    const hasInput = !!env.config.build?.rollupOptions?.input;
    const isClientWithHtml = env.config.consumer === 'client' && existsSync(resolve(ctx.root, 'index.html'));
    if (hasInput || isClientWithHtml) {
      await builder.build(env);
    }
  }

  await builder.build(server);
  await writeRouteTypes(ctx, builder);
}

/**
 * Writes the `@vercube/client` route map from the server just built: its entry
 * is run with introspection on, which stops it before it binds a port. A
 * failure is reported but does not fail the build.
 */
async function writeRouteTypes(ctx: VercubePluginContext, builder: ViteBuilder): Promise<void> {
  const outFile = resolveTypegenOutput(ctx.root, ctx.pluginConfig.typegen);
  if (!outFile) {
    return;
  }

  const logger = builder.config.logger;
  try {
    const sections = await inspectEntry(
      resolve(ctx.root, 'dist', 'index.mjs'),
      ['routes', 'discovery'],
      ctx.root,
      INSPECT_TIMEOUT,
    );
    const write = createRouteTypesWriter({
      root: ctx.root,
      outFile,
      logger: {
        warn: (message) => logger.warn(`[vercube] ${message}`),
        success: (message) => logger.info(`[vercube] ${message}`),
      },
    });
    // an empty map would replace a good one and break every typed call
    if (!Array.isArray(sections.routes?.data)) {
      throw new TypeError('The application did not report its routes');
    }
    await write(sections.routes.data as Parameters<typeof write>[0], sections.discovery?.data as Parameters<typeof write>[1]);
  } catch (error) {
    logger.warn(`[vercube] Route types not written: ${(error as Error).message}`);
  }
}
