import { createApp } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { TestingError } from '../Errors/TestingError';
import { TestLogger } from '../Services/TestLogger';
import { applyOverrides, bindProviders } from '../Utils/Bindings';
import { TestApp } from './TestApp';
import type { TestingTypes } from '../Types/TestingTypes';
import type { App, ConfigTypes } from '@vercube/core';

/** Configuration tests start from, under whatever `config` sets. */
const TEST_CONFIG: ConfigTypes.Config = {
  requestLogging: false,
  logLevel: 'error',
};

/**
 * Boots an application for a test: real controllers, real DI, real middleware
 * and validation, with any dependency replaced.
 *
 * Every call gets its own container, router and configuration. Neither
 * `vercube.config` nor `.env` is read unless `configFile` asks for it, and
 * requests go through `app.fetch()`, so no port is opened.
 *
 * Overrides are applied once every plugin has been applied, so they win over
 * anything a plugin binds. They cannot be changed afterwards: services already
 * hold what they were given.
 *
 * @param options - What to boot
 * @returns The booted application
 * @throws {TestingError} When the application fails to boot, naming the phase
 *
 * @example
 * ```ts
 * const app = await createTestApp({
 *   controllers: [UserController],
 *   providers: [UserService],
 *   overrides: [[UserRepository, { findById: async (id) => ({ id, name: 'Ada' }) }]],
 * });
 *
 * const res = await app.get('/users/1').expect(200);
 * expect(await res.json()).toEqual({ id: '1', name: 'Ada' });
 *
 * await app.close();
 * ```
 */
export async function createTestApp(options: TestingTypes.TestAppOptions = {}): Promise<TestApp> {
  const logs = options.logger === false ? null : new TestLogger();
  const extensions = options.extensions ?? [];

  let phase: TestingTypes.BootPhase = 'config';
  let current: string | null = null;
  let booted: App | null = null;

  const run = async (name: string, step: (() => unknown) | undefined): Promise<void> => {
    current = name;
    await step?.();
    current = null;
  };

  try {
    booted = await createApp({
      configFile: options.configFile ?? false,
      cfg: mergeConfig(options.config),
      setup: async (app) => {
        phase = 'setup';

        // bound before anything is constructed, so every service gets it
        if (logs) {
          app.container.bindInstance(Logger, logs);
        }

        bindProviders(app.container, options.providers);

        for (const controller of options.controllers ?? []) {
          app.container.bind(controller);
        }

        for (const plugin of options.plugins ?? []) {
          if (Array.isArray(plugin)) {
            app.addPlugin(plugin[0], plugin[1]);
          } else {
            app.addPlugin(plugin);
          }
        }

        for (const extension of extensions) {
          await run(`extension "${extension.name}"`, extension.setup && (() => extension.setup!(app)));
        }

        await run('setup()', options.setup && (() => options.setup!(app)));

        phase = 'plugins';
      },
      beforeInitialize: async (app) => {
        phase = 'overrides';

        // a plugin may have bound a logger of its own
        if (logs && app.container.getOptional(Logger) !== logs) {
          app.container.bindInstance(Logger, logs);
        }

        applyOverrides(app.container, options.overrides, options.strictOverrides);

        for (const extension of extensions) {
          await run(`extension "${extension.name}"`, extension.beforeInitialize && (() => extension.beforeInitialize!(app)));
        }

        phase = 'initialize';
      },
    });

    // a test app is driven without listen(), so the startup hooks run here
    await booted.start();

    const testApp = new TestApp(booted, {
      logs,
      baseUrl: options.baseUrl ?? 'http://localhost',
      extensions,
    });

    phase = 'ready';

    for (const extension of extensions) {
      await run(`extension "${extension.name}"`, extension.ready && (() => extension.ready!(testApp)));
    }

    return testApp;
  } catch (error) {
    // release what booted, the caller never gets a handle to close it
    await booted?.close({ timeout: 0 }).catch(() => {});

    const message = error instanceof Error ? error.message : String(error);
    const where = current ? ` in ${current}` : '';

    throw new TestingError(`createTestApp() failed during ${phase}${where}: ${message}`, { phase, cause: error });
  }
}

/**
 * Lays the options' configuration over the test defaults.
 *
 * @param config - The options' configuration
 * @returns The merged configuration
 */
function mergeConfig(config: ConfigTypes.Config = {}): ConfigTypes.Config {
  return { ...TEST_CONFIG, ...config };
}
