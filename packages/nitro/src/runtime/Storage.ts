import { Storage, StorageManager } from '@vercube/storage';
import { useStorage } from 'nitro/storage';
import type { StorageTypes } from '@vercube/storage';

/**
 * Manages multiple storage instances and provides a unified interface for storage operations.
 * Each storage instance is identified by a unique name and implements the Storage interface.
 * This class handles initialization, registration, and delegation of storage operations.
 */
export class NitroStorageManager extends StorageManager {
  /**
   * Mounts a new storage instance with the specified name
   * @param {StorageTypes.Mount} params - Mount parameters containing name and storage implementation
   * @param {string} [params.name] - Optional name for the storage instance, defaults to 'default'
   * @param {IOC.Newable<Storage>} params.storage - Storage implementation to mount
   * @returns {Promise<void>} A promise that resolves when mounting is complete
   */
  public async mount<T extends Storage<unknown>>(_opts: StorageTypes.Mount<T>): Promise<void> {
    this.gLogger?.warn(
      'NitroStorageManager::mount',
      'mounting storage is not supported for Nitro. Use options.storage in nitro.config.ts instead',
    );
  }

  /**
   * Retrieves a registered storage instance by name
   * @param {string} name - Name of the storage instance to retrieve
   * @returns {Storage | undefined} The storage instance if found, undefined otherwise
   */
  public getStorage(name: string = ''): Storage | undefined {
    // `useStorage(name)` always returns a view prefixed with `name:`, so an
    // unknown name would write prefixed keys into the root storage. Only a
    // name nitro.config.ts mounted gets its own view, anything else - including
    // `default` - uses the root storage.
    const root = useStorage();
    const mounted = name !== '' && name !== 'default' && root.getMount(name).base !== '';
    const storage = mounted ? useStorage(name) : root;

    return {
      getItem: storage.getItem.bind(storage),
      getItems: async <T>(keys: string[]) => (await storage.getItems(keys)).map((item) => item.value) as T[],
      setItem: storage.setItem.bind(storage),
      hasItem: storage.hasItem.bind(storage),
      getKeys: storage.getKeys.bind(storage),
      clear: storage.clear.bind(storage),
      deleteItem: storage.removeItem.bind(storage),
      // unstorage has no count, so it is the length of the full key listing
      size: async () => (await storage.getKeys()).length,
      cheapSize: false,
    } as unknown as Storage;
  }

  /**
   * Names of the storages mounted in nitro.config.ts, plus `default` for the
   * root storage. Nitro owns the mount table, so it is read from `useStorage()`.
   * @returns {string[]} Mount names, `default` first
   */
  public override get mounts(): string[] {
    return ['default', ...this.nitroMounts().map((mount) => mount.name)];
  }

  /**
   * Describes every storage nitro has mounted.
   *
   * The root storage lists every mount's keys under its prefix, so it is
   * listed once and each key goes to the mount with the longest matching
   * prefix: a nested mount's keys are not counted again in its parent.
   * unstorage cannot stop a listing early, so `maxKeys` only caps the result.
   * When the listing fails, every mount reports `null`.
   * @param {StorageTypes.DescribeOptions} [options] - Listing limits
   * @returns {Promise<StorageTypes.Description>} One entry per mount
   */
  public override async describe(options: StorageTypes.DescribeOptions = {}): Promise<StorageTypes.Description> {
    const maxKeys = options.maxKeys ?? 250;
    const root = useStorage();
    const entries = [{ name: 'default', base: '', driver: root.getMount('').driver }, ...this.nitroMounts()];

    let owned: Map<string, string[]> | null = null;

    try {
      const listed = await root.getKeys();
      // longest prefix first, so a key lands in the most specific mount
      const byPrefix = [...entries].sort((a, b) => b.base.length - a.base.length);

      owned = new Map(entries.map((entry) => [entry.name, []]));

      for (const key of listed) {
        const mount = byPrefix.find((entry) => key.startsWith(entry.base))!;
        owned.get(mount.name)!.push(key.slice(mount.base.length));
      }
    } catch {
      owned = null;
    }

    const mounts = entries.map(({ name, driver }) => {
      const keys = owned?.get(name) ?? null;

      return {
        name,
        driver: driver?.name ?? 'Storage',
        size: keys ? keys.length : null,
        keys: keys ? keys.slice(0, maxKeys) : null,
        truncated: keys ? keys.length > maxKeys : false,
        // unstorage has no increment, so counters are read and written separately
        atomicIncrement: false,
      };
    });

    return { mounts };
  }

  /**
   * Retrieves an item from the specified storage
   * @template T - Type of the stored value
   * @param {StorageTypes.GetItem} params - Parameters for retrieving an item
   * @param {string} [params.storage] - Name of the storage to retrieve from, defaults to 'default'
   * @param {string} params.key - Key of the item to retrieve
   * @returns {Promise<T | null>} A promise that resolves with the stored value or null if not found
   */
  public async getItem<T = unknown>({ storage, key }: StorageTypes.GetItem): Promise<T | null> {
    const storageInstance = this.getStorage(storage);
    return (await storageInstance?.getItem<T>(key)) ?? null;
  }

  /**
   * Retrieves multiple items from the specified storage
   * @template T - Type of the stored value
   * @param {StorageTypes.GetItems} params - Parameters for retrieving multiple items
   * @param {string} [params.storage] - Name of the storage to retrieve from, defaults to 'default'
   * @param {string[]} params.keys - Keys of the items to retrieve
   * @returns {Promise<T[]>} A promise that resolves with the stored values or empty array if not found
   */
  public async getItems<T = unknown>({ storage, keys }: StorageTypes.GetItems): Promise<T[]> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.getItems<T>(keys) ?? [];
  }

  /**
   * Stores an item in the specified storage
   * @template T - Type of the value to store
   * @param {StorageTypes.SetItem<T>} params - Parameters for storing an item
   * @param {string} [params.storage] - Name of the storage to store in, defaults to 'default'
   * @param {string} params.key - Key under which to store the value
   * @param {T} params.value - Value to store
   * @returns {Promise<void>} A promise that resolves when the value is stored
   */
  public async setItem<T = unknown, U = unknown>({ storage, key, value, options }: StorageTypes.SetItem<T, U>): Promise<void> {
    const storageInstance = this.getStorage(storage);
    await storageInstance?.setItem<T, U>(key, value, options);
  }

  /**
   * Deletes an item from the specified storage
   * @param {StorageTypes.DeleteItem} params - Parameters for deleting an item
   * @param {string} [params.storage] - Name of the storage to delete from, defaults to 'default'
   * @param {string} params.key - Key of the item to delete
   * @returns {Promise<void>} A promise that resolves when the item is deleted
   */
  public async deleteItem({ storage, key }: StorageTypes.DeleteItem): Promise<void> {
    const storageInstance = this.getStorage(storage);
    await storageInstance?.deleteItem(key);
  }

  /**
   * Checks if an item exists in the specified storage
   * @param {StorageTypes.HasItem} params - Parameters for checking item existence
   * @param {string} [params.storage] - Name of the storage to check, defaults to 'default'
   * @param {string} params.key - Key to check for
   * @returns {Promise<boolean>} A promise that resolves to true if the item exists, false otherwise
   */
  public async hasItem({ storage, key }: StorageTypes.HasItem): Promise<boolean> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.hasItem(key) ?? false;
  }

  /**
   * Retrieves all keys from the specified storage
   * @param {StorageTypes.GetKeys} params - Parameters for retrieving keys
   * @param {string} [params.storage] - Name of the storage to get keys from, defaults to 'default'
   * @returns {Promise<string[]>} A promise that resolves with an array of all keys
   */
  public async getKeys({ storage }: StorageTypes.GetKeys): Promise<string[]> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.getKeys() ?? [];
  }

  /**
   * Clears all items from the specified storage
   * @param {StorageTypes.Clear} params - Parameters for clearing storage
   * @param {string} [params.storage] - Name of the storage to clear, defaults to 'default'
   * @returns {Promise<void>} A promise that resolves when the storage is cleared
   */
  public async clear({ storage }: StorageTypes.Clear): Promise<void> {
    const storageInstance = this.getStorage(storage);
    await storageInstance?.clear();
  }

  /**
   * Gets the number of items in the specified storage
   * @param {StorageTypes.Size} params - Parameters for getting storage size
   * @param {string} [params.storage] - Name of the storage to get size of, defaults to 'default'
   * @returns {Promise<number>} A promise that resolves with the number of items
   */
  public async size({ storage }: StorageTypes.Size): Promise<number> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.size() ?? 0;
  }

  /**
   * Initializes the storage manager
   * @returns {Promise<void>} A promise that resolves when the storage manager is initialized
   */
  protected async init(): Promise<void> {
    // do nothing for Nitro Storage Manager
  }

  /**
   * The storages mounted in nitro.config.ts, without the root storage. A mount
   * named `default` is left out too: `getStorage('default')` reads the root
   * storage, so its keys are listed there under their `default:` prefix.
   * @returns Each mount's name, key prefix and driver
   * @private
   */
  private nitroMounts(): { name: string; base: string; driver: { name?: string } | undefined }[] {
    return useStorage()
      .getMounts()
      .filter((mount) => mount.base !== '' && mount.base !== 'default:')
      .map((mount) => ({ name: mount.base.replace(/:$/, ''), base: mount.base, driver: mount.driver }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
