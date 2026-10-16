import { defu } from 'defu';
import { resolve } from 'pathe';
import { setupHooks } from '../setup/Hooks';
import { getTransformedMiddlewares } from '../setup/Middleware';
import { getTransformedRoutes } from '../setup/Routes';
import { getTransformedServices } from '../setup/Services';
import type { RouteInfo } from '../build/Routes';
import type { ServiceInfo } from '../build/Services';
import type { NitroModule } from 'nitro/types';

export interface PluginOptions {
  scanDirs?: string[];
  /**
   * Path to a file that exports a default function for customizing the Vercube app
   * before the DI container is flushed. Use this to bind tokens, override services,
   * or perform any setup that auto-discovery cannot handle.
   *
   * The file must export a default function matching: `(app: App) => void | Promise<void>`
   *
   * @example
   * // nitro.config.ts
   * vercubeNitro({ setupFile: './src/container.ts' })
   *
   * // src/container.ts
   * import type { App } from '@vercube/core'
   * export default async (app: App) => {
   *   app.container.bind(DatabaseToken, PostgresDatabase)
   * }
   */
  setupFile?: string;
}

const defaultOptions: PluginOptions = {
  scanDirs: ['api', 'routes', 'services', 'repositories'],
};

export function vercubeNitro(options?: PluginOptions): NitroModule {
  options = defu(options, defaultOptions);

  return {
    name: '@vercube/nitro',
    setup: async (nitro) => {
      // setup hooks
      setupHooks(nitro, options);

      // One entry per class, keyed by file and class name: a file can hold
      // several controllers, and `users.ts` can exist in two scanned dirs. A
      // class bound as a route is not bound again as a service.
      const classes = new Map<string, RouteInfo | ServiceInfo>();

      for (const entry of [...(await getTransformedRoutes(nitro)), ...(await getTransformedServices(nitro, options?.scanDirs))]) {
        const key = `${entry.fullPath}:${entry.importClassName}`;

        if (!classes.has(key)) {
          classes.set(key, entry);
        }
      }

      const bindings = toBindings([...classes.values()]);

      // Scan middleware dir to exclude BaseMiddleware subclasses from Nitro's native handling
      await getTransformedMiddlewares(nitro);

      const setupFilePath = options?.setupFile ? resolve(nitro.options.rootDir, options.setupFile) : null;

      nitro.options.virtual['#internal/vercube-route-plugin'] = `
        import { definePlugin } from 'nitro';
        import { createNitroApp } from '@vercube/nitro';
        ${setupFilePath ? `import __vercubeSetup__ from '${setupFilePath}';` : ''}

        ${bindings.map((binding) => binding.import).join('\n')}

        export default definePlugin(async (nitroApp) => {
          // only build flags are baked in, the runtime config is read when the server starts
          const app = await createNitroApp(${JSON.stringify({ dev: nitro.options.dev, logLevel: nitro.options.logLevel })});
          nitroApp.__vercubeApp__ = app;
          globalThis.__vercubeApp__ = app;

          // bind routes and services to container
          ${bindings.map((binding) => `app.container.bind(${binding.name});`).join('\n')}

          ${setupFilePath ? `await __vercubeSetup__(app);` : ''}

          app.container.flushQueue();

        });
      `;

      nitro.options.plugins.push('#internal/vercube-route-plugin');
    },
  };
}

/**
 * Builds the import and the local name of every class to bind. A class name
 * already taken by a class from another file is imported under an alias, so
 * two `UsersController`s from `api/users.ts` and `routes/users.ts` both load.
 *
 * @param entries - Classes to bind, one per file and class name
 * @returns The import statement and local name of each class
 */
function toBindings(entries: (RouteInfo | ServiceInfo)[]): { import: string; name: string }[] {
  const taken = new Set<string>();

  return entries.map((entry, index) => {
    if (!taken.has(entry.importClassName)) {
      taken.add(entry.importClassName);
      return { import: entry.import, name: entry.importClassName };
    }

    const alias = `__vercube_${entry.importClassName}_${index}`;
    const statement = entry.import.includes('{')
      ? entry.import.replace(`{ ${entry.importClassName} }`, `{ ${entry.importClassName} as ${alias} }`)
      : entry.import.replace(`import ${entry.importClassName} from`, `import ${alias} from`);

    return { import: statement, name: alias };
  });
}
