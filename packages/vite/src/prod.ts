import { existsSync } from 'node:fs';
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
}
