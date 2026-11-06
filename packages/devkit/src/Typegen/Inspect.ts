import { resolve } from 'node:path';
import { inspectEntry } from '@vercube/scan';
import type { DevKitTypes } from '../Types/DevKitTypes';

/**
 * Runs the built application with introspection on and returns the sections.
 * Build first. See `inspectEntry()` in `@vercube/scan`.
 *
 * @param app - The devkit app
 * @param sections - Section ids; every section when empty
 * @param entry - Entry file relative to the output directory
 * @returns Section id to section
 */
export function inspect(
  app: DevKitTypes.App,
  sections: string[] = [],
  entry = 'index.mjs',
): Promise<Record<string, DevKitTypes.InspectedSection>> {
  const root = app.config.build?.root ?? process.cwd();

  return inspectEntry(resolve(root, app.config.build?.output?.dir ?? 'dist', entry), sections, root);
}
