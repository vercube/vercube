import { Container, Init, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Storage } from './Storage';
import type { StorageTypes } from '../Types/StorageTypes';

/**
 * Manages multiple storage instances and provides a unified interface for storage operations.
 * Each storage instance is identified by a unique name and implements the Storage interface.
 * This class handles initialization, registration, and delegation of storage operations.
 */
export class StorageManager {
  /** Container instance */
  @Inject(Container)
  protected gContainer!: Container;

  /** Logger instance */
  @InjectOptional(Logger)
  protected gLogger!: Logger | null;

  /**
   * Map of registered storage instances indexed by their names
   */
  protected fStorages: Map<string, StorageTypes.Storages> = new Map();

  /**
   * Mounts a new storage instance with the specified name
   * @param {StorageTypes.Mount} params - Mount parameters containing name and storage implementation
   * @param {string} [params.name] - Optional name for the storage instance, defaults to 'default'
   * @param {IOC.Newable<Storage>} params.storage - Storage implementation to mount
   * @returns {Promise<void>} A promise that resolves when mounting is complete
   */
  public async mount<T extends Storage<unknown>>({ name, storage, initOptions }: StorageTypes.Mount<T>): Promise<void> {
    this.fStorages.set(name ?? 'default', {
      storage: this.gContainer.resolve(storage),
      initOptions,
    });
  }

  /**
   * Retrieves a registered storage instance by name
   * @param {string} name - Name of the storage instance to retrieve
   * @returns {Storage | undefined} The storage instance if found, undefined otherwise
   */
  public getStorage(name: string = 'default'): Storage | undefined {
    return this.fStorages.get(name)?.storage ?? undefined;
  }

  /**
   * Names of every mounted storage.
   *
   * The rest of the API can only reach a mount whose name you already know, so
   * without this an inspector has no way to find out what is mounted.
   * @returns {string[]} Mount names, in mount order
   */
  public get mounts(): string[] {
    return [...this.fStorages.keys()];
  }

  /**
   * Describes what the storage layer currently holds.
   *
   * Drivers that cannot enumerate or count report `null` rather than an empty
   * list, so "nothing stored" stays distinguishable from "cannot tell".
   * @param {StorageTypes.DescribeOptions} [options] - Listing limits
   * @returns {Promise<StorageTypes.Description>} One entry per mount
   */
  public async describe(options: StorageTypes.DescribeOptions = {}): Promise<StorageTypes.Description> {
    const maxKeys = options.maxKeys ?? 250;

    const mounts = await Promise.all(
      [...this.fStorages.entries()].map(async ([name, mount]) => {
        const driver = mount.storage as unknown as {
          getKeys?: () => string[] | Promise<string[]>;
          size?: () => number | Promise<number>;
        };

        const keys = typeof driver.getKeys === 'function' ? await safely(() => driver.getKeys!()) : null;
        const size = typeof driver.size === 'function' ? await safely(() => driver.size!()) : (keys?.length ?? null);

        return {
          name,
          driver: (mount.storage as object)?.constructor?.name ?? 'Storage',
          size: size ?? null,
          keys: keys ? keys.slice(0, maxKeys) : null,
          truncated: keys ? keys.length > maxKeys : false,
        };
      }),
    );

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
    return storageInstance?.getItem<T>(key) ?? null;
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
    storageInstance?.setItem<T, U>(key, value, options);
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
    storageInstance?.deleteItem(key);
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
    storageInstance?.clear();
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
   * Initializes all registered storage instances
   * Called automatically with @Init() decorator
   * @returns {Promise<void>} A promise that resolves when all storages are initialized
   */
  @Init()
  protected async init(): Promise<void> {
    for (const { storage, initOptions } of this.fStorages.values()) {
      try {
        await storage?.initialize(initOptions);
      } catch (error) {
        this.gLogger?.error('Vercube/StorageManager::init', error);
      }
    }
  }
}

/**
 * Runs a driver call, turning a failure into `null`.
 *
 * A driver backed by a remote service can fail at any time, and describing the
 * storage layer must never be the thing that breaks a request.
 *
 * @param {Function} fn - The call to attempt
 * @returns {Promise<T | null>} The result, or null when it threw
 */
async function safely<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
