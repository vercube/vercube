import { Container, Init, Inject, InjectOptional } from '@vercube/di';
import { Storage } from './Storage';
import { StorageTypes } from '../Types/StorageTypes';
import { Logger } from '@vercube/logger';

/**
 * Manages multiple storage instances and provides a unified interface for storage operations.
 * Each storage instance is identified by a unique name and implements the Storage interface.
 * This class handles initialization, registration, and delegation of storage operations.
 */
export class StorageManager {
  @Inject(Container)
  private gContainer: Container;

  @InjectOptional(Logger)
  private gLogger: Logger | null;

  /**
   * Map of registered storage instances indexed by their names
   */
  private fStorages: Map<string, StorageTypes.Storages> = new Map();

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
  private async init(): Promise<void> {
    for (const { storage, initOptions } of this.fStorages.values()) {
      try {
        await storage?.initialize(initOptions);
      } catch (error) {
        this.gLogger?.error('Vercube/StorageManager::init', error);
      }
    }
  }
}
