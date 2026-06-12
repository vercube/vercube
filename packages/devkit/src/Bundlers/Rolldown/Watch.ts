import { watch as nodeWatch } from 'chokidar';
import { resolve } from 'pathe';
import { watch as rolldownWatch } from 'rolldown';
import { reloadDevkitResolvedConfig } from '../../Common/reloadConfig';
import { getRolldownConfig } from './Config';
import type { DevKitTypes } from '../../Types/DevKitTypes';
import type { DotenvOptions } from 'c12';

/**
 * Creates a watcher for rolldown
 * @param {DevKitTypes.App} app - The application instance.
 * This file is highly inspired by Nitro
 * @see https://github.com/nitrojs/nitro/blob/v2/src/core/build/dev.ts
 */
export async function watch(app: DevKitTypes.App): Promise<void> {
  let rolldownWatcher: { close: () => void } | undefined;
  let extraWatcher: ReturnType<typeof nodeWatch> | undefined;

  const root = () => app.config.build?.root ?? process.cwd();

  const filesToWatch = () => [
    resolve(root(), (app.config?.c12?.dotenv as DotenvOptions)?.fileName?.[0] ?? '.env'),
    resolve(root(), 'vercube.config.ts'),
    resolve(root(), app.config.build?.tsconfig ?? 'tsconfig.json'),
  ];

  const startRolldown = async () => {
    rolldownWatcher?.close();
    const bundlerConfig = await getRolldownConfig(app.config.build);
    const watcher = rolldownWatch({
      ...bundlerConfig,
      onwarn: () => {},
    });
    rolldownWatcher = watcher;

    watcher.on('event', (event: { code: string; error?: Error }) => {
      switch (event.code) {
        case 'START': {
          void app.hooks.callHook('bundler-watch:init');
          return;
        }
        case 'BUNDLE_START': {
          void app.hooks.callHook('bundler-watch:start');
          return;
        }
        case 'END': {
          void app.hooks.callHook('bundler-watch:end');
          return;
        }
        case 'ERROR': {
          console.error(event.error);
          void app.hooks.callHook('bundler-watch:error', event.error!);
        }
      }
    });
  };

  const startChokidar = () => {
    extraWatcher?.close();
    extraWatcher = nodeWatch(filesToWatch(), {
      ignoreInitial: true,
    });

    extraWatcher.on('all', async () => {
      await reloadDevkitResolvedConfig(app);
      await app.hooks.callHook('bundler-watch:restart');
      await startRolldown();
    });
  };

  await startRolldown();
  startChokidar();
}
