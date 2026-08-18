import { Container, Inject } from '@vercube/di';
import { flattenConfig, isSecretKey } from '../Utils/Flatten';
import { describeKey } from '../Utils/Introspect';
import { previewValue } from '../Utils/Preview';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Maximum keys listed per mount. */
const MAX_KEYS = 250;

/** Shape a storage driver must expose to be readable. */
interface DriverLike {
  getKeys?: () => string[] | Promise<string[]>;
  size?: () => number | Promise<number>;
  getItem?: (key: string) => unknown;
}

/** Internal mount table kept by `StorageManager`. */
type MountTable = Map<string, { storage: DriverLike }>;

/**
 * Reports what the storage and cache layers currently hold.
 * Optional packages are discovered by name in the container; nothing is imported or instantiated.
 */
export class StorageCollector {
  @Inject(Container)
  private readonly gContainer!: Container;

  /**
   * Reads every mounted storage and the cache configuration.
   * @returns what could be seen of the storage layer
   */
  public async collect(): Promise<DevtoolsTypes.StorageView> {
    const manager = this.resolveLive<{ getStorage?: unknown }>('StorageManager');
    const cache = this.resolveLive<{ defaults?: unknown; adapter?: unknown }>('CacheManager');

    return {
      available: manager !== null,
      mounts: manager ? await this.readMounts(manager) : [],
      cache: {
        available: cache !== null,
        defaults: cache ? flattenConfig(cache.defaults ?? null) : [],
        mount: this.readCacheMount(cache),
      },
    };
  }

  /**
   * Reads a single value from a named mount.
   * Values stored under a credential-looking key are never returned.
   * @param mount name of the mount to read from
   * @param key key to read
   * @returns a preview of the value, or an error description
   */
  public async readValue(mount: string, key: string): Promise<DevtoolsTypes.StorageValue> {
    const manager = this.resolveLive<object>('StorageManager');
    const table = manager && (manager as unknown as { fStorages?: MountTable }).fStorages;
    const driver = table?.get(mount)?.storage;

    if (!driver) {
      return { mount, key, type: 'undefined', size: 0, truncated: false, error: `No "${mount}" mount is active.` };
    }

    if (typeof driver.getItem !== 'function') {
      return { mount, key, type: 'undefined', size: 0, truncated: false, error: 'This driver cannot read a single key.' };
    }

    if (isSecretKey(key)) {
      return { mount, key, type: 'redacted', size: 0, truncated: false, text: '<redacted>' };
    }

    try {
      const value = await driver.getItem(key);

      if (value === undefined) {
        return { mount, key, type: 'undefined', size: 0, truncated: false, error: 'Nothing is stored under this key.' };
      }

      return { mount, key, ...previewValue(value) };
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
   * Reads every mount the manager holds.
   * @param manager the live storage manager
   * @returns one entry per mount
   */
  private async readMounts(manager: object): Promise<DevtoolsTypes.StorageMount[]> {
    const table = (manager as unknown as { fStorages?: MountTable }).fStorages;

    if (!table || typeof table.entries !== 'function') {
      return [];
    }

    const mounts: DevtoolsTypes.StorageMount[] = [];

    for (const [name, entry] of table.entries()) {
      mounts.push(await this.readMount(name, entry?.storage));
    }

    return mounts.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Reads one mount.
   * @param name mount name
   * @param driver the driver instance
   * @returns the mount description
   */
  private async readMount(name: string, driver: DriverLike | undefined): Promise<DevtoolsTypes.StorageMount> {
    const base = {
      name,
      driver: driver?.constructor?.name ?? 'unknown',
      size: null,
      keys: [],
      truncated: false,
    } satisfies DevtoolsTypes.StorageMount;

    if (typeof driver?.getKeys !== 'function') {
      return { ...base, error: 'This driver cannot list its keys.' };
    }

    try {
      const keys = await driver.getKeys();
      const size = typeof driver.size === 'function' ? await driver.size() : keys.length;

      return { ...base, size, keys: keys.slice(0, MAX_KEYS), truncated: keys.length > MAX_KEYS };
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * @param cache the live cache manager, when there is one
   * @returns the storage mount the cache writes through, when it names one
   */
  private readCacheMount(cache: { defaults?: unknown } | null): string | null {
    const defaults = cache?.defaults;

    if (defaults && typeof defaults === 'object' && 'storage' in defaults) {
      const storage = (defaults as { storage?: unknown }).storage;
      return typeof storage === 'string' ? storage : null;
    }

    return null;
  }

  /**
   * Finds an already-constructed service by its display name.
   * @param name service name to look for
   * @returns the live instance, or null when unbound or never instantiated
   */
  private resolveLive<T extends object>(name: string): T | null {
    for (const [key] of this.gContainer.services) {
      if (describeKey(key) !== name || !this.gContainer.hasInstance(key)) {
        continue;
      }

      return this.gContainer.get(key as never) as T;
    }

    return null;
  }
}
