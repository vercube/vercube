/** Where the documentation of an error code lives. */
const DOCS_URL = 'https://vercube.dev/docs/core-features/errors';

interface Entry {
  message: (params: any) => string;
  why: string;
  fix: string;
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
 * because this package has no dependency on the framework: one factory per
 * entry, building an error with its code, why, fix and link attached.
 *
 * @param {string} prefix - What every code starts with
 * @param {TMap} map - The entries, keyed by the rest of the code
 * @returns {Catalog<TMap>} One factory per entry
 */
function defineCatalog<TMap extends Record<string, Entry>>(prefix: string, map: TMap): Catalog<TMap> {
  const catalog: Record<string, unknown> = {};
  const descriptions: Description[] = [];
  // every parameter names itself, so the reference shows `<seconds>`
  const names = new Proxy({}, { get: (_target, key) => `<${String(key)}>` });

  for (const [key, entry] of Object.entries(map)) {
    const code = `${prefix}_${key}`;
    const guidance = { code, why: entry.why, fix: entry.fix, link: `${DOCS_URL}#${code.toLowerCase()}` };

    const factory = (params: unknown): Error => {
      // bare-error: the catalog of a package without dependencies builds its own errors
      const error = new Error(entry.message(params));

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
 * The errors of the scanner and of the route type generation.
 */
export const ScanErrors = defineCatalog('VERCUBE_SCAN', {
  INSPECT_TIMEOUT: {
    message: ({ seconds }: { seconds: number }) => `Inspect did not finish within ${seconds}s`,
    why: 'The built entry is run in a child process to read the routes of the application, and it did not report them in time. The `setup` of the application usually waits on a service that never answers, such as a database or a queue that is not running.',
    fix: 'Start the services the application connects to while it boots, or skip those connections when `process.env.VERCUBE_INSPECT` is set. When the route types are not needed, set `build.typegen` to `false` in `vercube.config.ts`, or pass `typegen: false` to `vercube()` with the Vite plugin.',
  },
  INSPECT_FAILED: {
    message: ({ code }: { code: number | null }) => `Inspect exited with code ${code}`,
    why: 'The built entry is run in a child process to read the routes of the application, and that process ended with an error before it reported them. The application threw while it started, and its output is printed above this error.',
    fix: 'Run the built entry yourself to see it fail, `node dist/index.mjs`, and fix the error it prints. An environment variable the application needs at startup must also be set where the inspection runs.',
  },
});
