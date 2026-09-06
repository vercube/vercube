import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'pathe';
import type { IntrospectionTypes } from '../../../Types/IntrospectionTypes';

/**
 * Where the build-time scanner writes what it found, next to the generated
 * server entry so it stays out of source control and file watchers.
 */
export const DISCOVERY_MANIFEST_REL = 'node_modules/.vercube/discovery.json';

/**
 * Exposes the build-time discovery manifest at runtime.
 *
 * Vercube has two disjoint views of an application: what the scanner sees in
 * the source (file paths, import statements) and what the container holds at
 * runtime (bindings, routes, middleware chains). Nothing joined them, so an
 * inspector could show a controller without being able to say which file it
 * lives in. This section is that join: it is keyed by class name, which is also
 * the container's binding key.
 *
 * The manifest is optional. Applications that do not build through
 * `@vercube/vite` or `@vercube/scan` simply have no `discovery` section.
 */
export class DiscoveryProvider implements IntrospectionTypes.Provider<IntrospectionTypes.DiscoveryDescription | null> {
  /** @inheritdoc */
  public readonly id = 'discovery';

  /** @inheritdoc */
  public readonly title = 'Discovery';

  /** Absolute path of the manifest. */
  private readonly fPath: string;

  /**
   * @param root - Project root; the manifest is looked up beneath it
   */
  constructor(root: string = process.cwd()) {
    this.fPath = resolve(root, DISCOVERY_MANIFEST_REL);
  }

  /**
   * Modification time of the manifest, so a rescan during development shows up
   * without the file having to be read.
   *
   * @returns The manifest's mtime, or 0 when it does not exist
   */
  public revision(): number {
    try {
      return statSync(this.fPath).mtimeMs;
    } catch {
      return 0;
    }
  }

  /** @inheritdoc */
  public describe(): IntrospectionTypes.DiscoveryDescription | null {
    try {
      return JSON.parse(readFileSync(this.fPath, 'utf8')) as IntrospectionTypes.DiscoveryDescription;
    } catch {
      return null;
    }
  }
}
