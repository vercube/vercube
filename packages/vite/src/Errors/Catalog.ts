/** Where the documentation of an error code lives. */
const DOCS_URL = 'https://vercube.dev/docs/core-features/errors';

interface Entry {
  message: (params: any) => string;
  why: string;
  fix: string;
  /** Builds the error, a plain `Error` by default. */
  create?: (message: string) => Error;
}

interface Description {
  code: string;
  message: string;
  why: string;
  fix: string;
  link: string;
}

type Catalog<TMap extends Record<string, Entry>> = {
  readonly [K in keyof TMap]: (...args: Parameters<TMap[K]['message']>) => Error;
} & { readonly prefix: string; describe(): Description[] };

/**
 * The shape of `defineErrorCatalog()` from `@vercube/di`, written out here
 * because the plugin and its dev worker do not depend on the framework at
 * runtime: one factory per entry, building an error with its code, why, fix
 * and link attached.
 *
 * @param {string} prefix - What every code starts with
 * @param {TMap} map - The entries, keyed by the rest of the code
 * @returns {Catalog<TMap>} One factory per entry
 */
function defineCatalog<TMap extends Record<string, Entry>>(prefix: string, map: TMap): Catalog<TMap> {
  const catalog: Record<string, unknown> = {};
  const descriptions: Description[] = [];
  // every parameter names itself, so the reference shows `<name>`
  const names = new Proxy({}, { get: (_target, key) => `<${String(key)}>` });

  for (const [key, entry] of Object.entries(map)) {
    const code = `${prefix}_${key}`;
    const guidance = { code, why: entry.why, fix: entry.fix, link: `${DOCS_URL}#${code.toLowerCase()}` };

    const factory = (params: unknown): Error => {
      const message = entry.message(params);
      // bare-error: the catalog of a package without the framework builds its own errors
      const error = entry.create ? entry.create(message) : new Error(message);

      // the trace starts where the error was created, not in this function
      Error.captureStackTrace?.(error, factory);

      for (const [field, value] of Object.entries(guidance)) {
        Object.defineProperty(error, field, { value, enumerable: false, writable: true, configurable: true });
      }

      // the mark `getErrorGuidance()` of `@vercube/di` looks for, by its registered name
      Object.defineProperty(error, Symbol.for('vercube.error.guidance'), { value: true, enumerable: false, configurable: true });

      return error;
    };

    catalog[key] = factory;
    descriptions.push({ ...guidance, message: entry.message(names) });
  }

  Object.defineProperties(catalog, {
    prefix: { value: prefix },
    describe: { value: () => descriptions.map((description) => ({ ...description })) },
  });

  return catalog as Catalog<TMap>;
}

/**
 * The errors of the Vite plugin and of its dev worker.
 */
export const ViteErrors = defineCatalog('VERCUBE_VITE', {
  ENVIRONMENT_NOT_CONFIGURED: {
    message: ({ name }: { name: string }) => `[vercube] Environment "${name}" is not configured.`,
    why: 'The production build looked for the server environment the `vercube()` plugin adds to the Vite config and did not find it. A plugin that runs after it replaced the `environments` option instead of adding to it.',
    fix: 'List `vercube()` from `@vercube/vite` in `plugins` after any plugin that rewrites `environments`, or make that plugin keep the `vercube` key.',
  },
  ROUTES_NOT_REPORTED: {
    message: () => 'The application did not report its routes',
    why: 'The built server was run to read its routes for the `@vercube/client` route map, and its answer had no `routes` section. The `@vercube/core` the application was built with is older than this plugin and does not know that section.',
    fix: 'Install the same version of every `@vercube/*` package, and check it with `pnpm why @vercube/core`. Pass `typegen: false` to `vercube()` when the route map is not needed.',
    create: (message) => new TypeError(message),
  },
  NO_FETCH_HANDLER: {
    message: ({ entry }: { entry: string }) => `No fetch handler exported from ${entry}`,
    why: 'The dev worker imported the entry of a Vite environment and found neither a `fetch` export nor a default export with a `fetch` method, so it has nothing to hand the request to.',
    fix: 'Export the handler from the entry of that environment: `export const fetch = app.fetch.bind(app)`. The entry the plugin generates for the `vercube` environment already does.',
  },
  UNKNOWN_ENVIRONMENT: {
    message: ({ name }: { name: string }) => `Unknown vite environment "${name}"`,
    why: 'A request reached the dev worker with an `x-vite-env` header that names an environment the worker was never told about. The worker only knows the environments the dev server registered with it.',
    fix: 'Send the request without the `x-vite-env` header, or with `x-vite-env: vercube`, to reach the application.',
  },
  ENV_RUNNER_NOT_INITIALIZED: {
    message: () => '[vercube] Env runner not initialized. Call initEnvRunner() first.',
    why: '`getEnvRunner()` was called before the worker that runs the server code in development was started. The plugin starts it when the dev server is configured.',
    fix: 'Await `initEnvRunner(ctx)` before calling `getEnvRunner(ctx)`.',
  },
});
