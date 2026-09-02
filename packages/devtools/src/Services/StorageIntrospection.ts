import { flattenConfig, isSecretKey } from '@vercube/core';
import { Container, describeKey, Inject } from '@vercube/di';
import { previewValue } from '../Utils/Preview';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { IntrospectionTypes } from '@vercube/core';

/** Public surface of `@vercube/storage`'s manager that this reads. */
interface StorageManagerLike {
  mounts: string[];
  describe(options?: { maxKeys?: number }): Promise<{ mounts: StorageMountDescription[] }>;
  getItem<T>(params: { storage: string; key: string }): Promise<T | null>;
}

/** One mounted storage, as `@vercube/storage` describes it. */
export interface StorageMountDescription {
  name: string;
  driver: string;
  size: number | null;
  keys: string[] | null;
  truncated: boolean;
}

/** Public surface of `@vercube/cache`'s manager that this reads. */
interface CacheManagerLike {
  defaults: Record<string, unknown>;
}

/** What the storage section reports. */
export interface StorageDescription {
  /** Whether a storage manager is active in this application. */
  available: boolean;
  /** Mounted storages and what they hold. */
  mounts: StorageMountDescription[];
  cache: {
    available: boolean;
    /** Flattened cache defaults. */
    defaults: IntrospectionTypes.ConfigEntry[];
    /** Mount the cache writes through, when it names one. */
    mount: string | null;
  };
}

/**
 * Describes the storage and cache layers, when the application uses them.
 *
 * `@vercube/storage` and `@vercube/cache` are optional and deliberately do not
 * depend on core, so they cannot register an introspection section themselves.
 * Devtools registers it on their behalf, looking the managers up by name among
 * services the application has **already instantiated** - resolving them would
 * construct a storage the application never asked for, which an inspector must
 * never do.
 */
export class StorageIntrospection implements IntrospectionTypes.Provider<StorageDescription> {
  /** @inheritdoc */
  public readonly id = 'storage';

  /** @inheritdoc */
  public readonly title = 'Storage';

  @Inject(Container)
  private readonly gContainer!: Container;

  /** @inheritdoc */
  public revision(): number {
    // Mount tables change rarely, but their contents change constantly, so the
    // section is rebuilt on every read rather than cached against a revision.
    return Date.now();
  }

  /** @inheritdoc */
  public async describe(): Promise<StorageDescription> {
    const storage = this.resolveLive<StorageManagerLike>('StorageManager');
    const cache = this.resolveLive<CacheManagerLike>('CacheManager');

    const described = storage ? await storage.describe() : { mounts: [] };
    const defaults = cache?.defaults ?? {};

    return {
      available: storage !== null,
      mounts: described.mounts,
      cache: {
        available: cache !== null,
        defaults: flattenConfig(defaults),
        mount: typeof defaults.storage === 'string' ? defaults.storage : null,
      },
    };
  }

  /**
   * Reads a single value out of a mounted storage.
   *
   * Values stored under a credential-looking key are never returned: a storage
   * browser is an easy place to leak a session token into a screenshot.
   *
   * @param mount - Mount name
   * @param key - Key to read
   * @returns A preview of the value, or a description of why there is none
   */
  public async readValue(mount: string, key: string): Promise<DevtoolsTypes.StorageValue> {
    const storage = this.resolveLive<StorageManagerLike>('StorageManager');

    if (!storage || !storage.mounts.includes(mount)) {
      return { mount, key, type: 'undefined', size: 0, truncated: false, error: `No "${mount}" mount is active.` };
    }

    if (isSecretKey(key)) {
      return { mount, key, type: 'redacted', size: 0, truncated: false, text: '<redacted>' };
    }

    try {
      return { mount, key, ...previewValue(await storage.getItem({ storage: mount, key })) };
    } catch (error) {
      return {
        mount,
        key,
        type: 'undefined',
        size: 0,
        truncated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Finds an already-constructed service by the name of its binding key.
   *
   * @param name - Display name of the binding key
   * @returns The instance, or null when it is not bound or not yet built
   */
  private resolveLive<T>(name: string): T | null {
    for (const [key] of this.gContainer.services) {
      if (describeKey(key) === name && this.gContainer.hasInstance(key)) {
        return this.gContainer.get<T>(key as never);
      }
    }

    return null;
  }
}
