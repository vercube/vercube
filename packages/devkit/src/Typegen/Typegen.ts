import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findControllers, generateRouteTypes, writeRouteTypes } from '@vercube/scan';
import consola from 'consola';
import { inspect } from './Inspect';
import type { DevKitTypes } from '../Types/DevKitTypes';
import type { IntrospectionTypes } from '@vercube/core';

/** Where the route map goes unless `build.typegen.output` says otherwise. */
export const DEFAULT_TYPEGEN_OUTPUT = '.vercube/routes.d.ts';

/**
 * Whether the route map should be written: `build.typegen` when set, otherwise
 * only for projects that depend on `@vercube/client`, so nobody gets a file
 * that imports a package they do not have.
 *
 * @param app - The devkit app
 * @returns Where to write it, or `null` when it is off
 */
export function resolveTypegenOutput(app: DevKitTypes.App): string | null {
  const root = app.config.build?.root ?? process.cwd();
  const option = app.config.build?.typegen;

  if (option === false) {
    return null;
  }

  if (option === undefined && !dependsOnClient(root)) {
    return null;
  }

  return resolve(root, (typeof option === 'object' ? option.output : undefined) ?? DEFAULT_TYPEGEN_OUTPUT);
}

/**
 * Writes the typed route map for `@vercube/client`.
 *
 * Routes come from the application itself (the `routes` introspection
 * section), so `setControllerPath()`, plugins and anything `setup` registers
 * are what they are at runtime. Controller files come from the `discovery`
 * section when the build has one, and from scanning the project otherwise.
 *
 * Routes whose controller cannot be imported are left out with one warning
 * each. The file is only rewritten when its content changes.
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
  const outFile = options.force
    ? resolve(
        root,
        (typeof app.config.build?.typegen === 'object' ? app.config.build.typegen.output : undefined) ?? DEFAULT_TYPEGEN_OUTPUT,
      )
    : resolveTypegenOutput(app);

  if (!outFile) {
    return null;
  }

  let routes = options.routes;
  let discovery = options.discovery;

  if (!routes) {
    const sections = await inspect(app, ['routes', 'discovery']);

    routes = (sections.routes?.data ?? []) as IntrospectionTypes.RouteDescription[];
    discovery = sections.discovery?.data as IntrospectionTypes.DiscoveryDescription | null | undefined;
  }

  const controllers = await findControllers(
    discovery?.controllers?.length ? discovery.controllers.map((c) => resolve(discovery!.root ?? root, c.path)) : root,
  );
  const { code, skipped } = generateRouteTypes({ routes, controllers, outFile });
  const written = writeRouteTypes(outFile, code);

  for (const { id, reason } of skipped) {
    consola.warn({ tag: 'typegen', message: `Skipped ${id}: ${reason}` });
  }

  if (written) {
    consola.success({ tag: 'typegen', message: `Route types written to ${outFile}` });
  }

  return { file: outFile, written, routes: routes.length, skipped };
}

/**
 * @param root - Project root
 * @returns True when its `package.json` lists `@vercube/client`
 */
function dependsOnClient(root: string): boolean {
  const file = resolve(root, 'package.json');

  if (!existsSync(file)) {
    return false;
  }

  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>;

    return ['dependencies', 'devDependencies', 'peerDependencies'].some((key) => Boolean(pkg[key]?.['@vercube/client']));
  } catch {
    return false;
  }
}
