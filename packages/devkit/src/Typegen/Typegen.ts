import { createRouteTypesWriter, INSPECT_TIMEOUT, resolveTypegenOutput } from '@vercube/scan';
import consola from 'consola';
import { inspect } from './Inspect';
import type { DevKitTypes } from '../Types/DevKitTypes';
import type { IntrospectionTypes } from '@vercube/core';
import type { RouteTypesWriterOptions } from '@vercube/scan';

/** Typegen messages, tagged like the rest of the devkit output. */
const logger: RouteTypesWriterOptions['logger'] = {
  warn: (message) => consola.warn({ tag: 'typegen', message }),
  success: (message) => consola.success({ tag: 'typegen', message }),
};

/**
 * Writes the typed route map for `@vercube/client`.
 *
 * Routes come from the application itself (the `routes` introspection
 * section), so `setControllerPath()`, plugins and anything `setup` registers
 * are what they are at runtime. Controller files come from the `discovery`
 * section when the build has one, and from scanning the project otherwise.
 *
 * Off unless `build.typegen` is set or the project depends on
 * `@vercube/client`. Routes whose controller cannot be imported are left out
 * with one warning each, and the file is only rewritten when it changes.
 *
 * @param app - The devkit app, already built unless `routes` is given
 * @param options - Routes to use instead of running the app, and whether to force it on
 * @returns What was written, or `null` when typegen is off
 */
export async function typegen(
  app: DevKitTypes.App,
  options: DevKitTypes.TypegenRunOptions = {},
): Promise<DevKitTypes.TypegenResult | null> {
  const root = app.config.build?.root ?? process.cwd();
  const outFile = resolveTypegenOutput(root, app.config.build?.typegen, options.force);

  if (!outFile) {
    return null;
  }

  let { routes, discovery } = options;

  if (!routes) {
    const sections = await inspect(app, ['routes', 'discovery'], undefined, INSPECT_TIMEOUT);

    // an empty map would replace a good one and break every typed call
    if (!Array.isArray(sections.routes?.data)) {
      throw new TypeError('The application did not report its routes');
    }

    routes = sections.routes.data as IntrospectionTypes.RouteDescription[];
    discovery = sections.discovery?.data as IntrospectionTypes.DiscoveryDescription | null | undefined;
  }

  const { file, written, skipped, files } = await createRouteTypesWriter({ root, outFile, logger })(routes, discovery);

  return { file, written, routes: routes.length, skipped, files };
}

/**
 * Keeps the route map in step with a running dev worker.
 *
 * The worker reports its routes after every restart, which in development is
 * every save; the file is only rewritten when the map it would hold differs
 * from what is on disk.
 *
 * @param app - The devkit app
 * @returns A handler for worker messages, or `null` when typegen is off
 */
export function watchRouteTypes(app: DevKitTypes.App): ((message: unknown) => Promise<void>) | null {
  const root = app.config.build?.root ?? process.cwd();
  const outFile = resolveTypegenOutput(root, app.config.build?.typegen);

  if (!outFile) {
    return null;
  }

  const write = createRouteTypesWriter({ root, outFile, logger });
  let queue = Promise.resolve();

  return (message: unknown): Promise<void> => {
    if (!isRoutesMessage(message)) {
      return queue;
    }

    queue = queue
      .then(async () => {
        await write(message.routes, message.discovery);
      })
      .catch((error: Error) => {
        consola.warn({ tag: 'typegen', message: `Route types not written: ${error.message}` });
      });

    return queue;
  };
}

/**
 * @param message - Anything a worker sent
 * @returns True for a routes report
 */
export function isRoutesMessage(message: unknown): message is DevKitTypes.RoutesMessage {
  return (
    (message as DevKitTypes.RoutesMessage | null)?.type === 'vercube:routes' &&
    Array.isArray((message as DevKitTypes.RoutesMessage).routes)
  );
}
