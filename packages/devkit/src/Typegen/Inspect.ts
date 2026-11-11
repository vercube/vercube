import { basename, resolve } from 'node:path';
import { inspectEntry } from '@vercube/scan';
import type { DevKitTypes } from '../Types/DevKitTypes';

/**
 * Runs the built application with introspection on and returns the sections.
 * Build first. See `inspectEntry()` in `@vercube/scan`.
 *
 * @param app - The devkit app
 * @param sections - Section ids; every section when empty
 * @param entry - Entry file relative to the output directory, the built application entry by default
 * @param timeout - Milliseconds before the run is stopped and the call rejects; 0 waits forever
 * @returns Section id to section
 */
export function inspect(
  app: DevKitTypes.App,
  sections: string[] = [],
  entry = builtEntry(app),
  timeout = 0,
): Promise<Record<string, DevKitTypes.InspectedSection>> {
  const root = app.config.build?.root ?? process.cwd();

  return inspectEntry(resolve(root, app.config.build?.output?.dir ?? 'dist', entry), sections, root, timeout);
}

/**
 * The file the build writes for the application's entry: `index.mjs` for a
 * single entry, named after the first file for a list of them, as rolldown
 * names them.
 *
 * @param app - The devkit app
 * @returns File name relative to the output directory
 */
export function builtEntry(app: DevKitTypes.App): string {
  const entry = app.config.build?.entry;

  if (!Array.isArray(entry) || entry.length === 0) {
    return 'index.mjs';
  }

  return `${basename(entry[0]).replace(/\.[^.]+$/, '')}.mjs`;
}
