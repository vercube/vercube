import { Container, describeKey, Inject } from '@vercube/di';
import type { IntrospectionTypes } from '@vercube/core';

/** Public surface of `@vercube/storage`'s manager that this reads. */
interface StorageManagerLike {
  mounts: string[];
  describe(options?: { maxKeys?: number }): Promise<unknown>;
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
  storage: unknown;
  cache: {
    available: boolean;
    defaults: Record<string, unknown>;
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

    return {
      available: storage !== null,
      storage: storage ? await storage.describe() : { mounts: [] },
      cache: {
        available: cache !== null,
        defaults: cache?.defaults ?? {},
      },
    };
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
