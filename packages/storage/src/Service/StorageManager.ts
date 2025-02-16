import { Container, Init, Inject, type IOC } from '@vercube/di';
import { Storage } from './Storage';

/**
 * Manages multiple storage instances and provides a unified interface for storage operations.
 * Each storage instance is identified by a unique name and implements the Storage interface.
 * This class handles initialization, registration, and delegation of storage operations.
 */
export class StorageManager {

  @Inject(Container)
  private gContainer: Container;

  /** Map of registered storage instances indexed by their names */
  private fStorages: Map<string, Storage> = new Map();

  /**
   * Registers a new storage instance with the specified name
   * @param {string} name - Unique identifier for the storage instance
   * @param {IOC.Newable<Storage>} storage - Storage implementation to register
   * @returns {Promise<void>} A promise that resolves when registration is complete
   */
  public async registerStorage(name: string, storage: IOC.Newable<Storage>): Promise<void> {
    this.fStorages.set(name, this.gContainer.resolve(storage));
  }

  /**
   * Retrieves a registered storage instance by name
   * @param {string} name - Name of the storage instance to retrieve
   * @returns {Storage | undefined} The storage instance if found, undefined otherwise
   */
  public getStorage(name: string): Storage | undefined {
    return this.fStorages.get(name);
  }

  /**
   * Retrieves an item from the specified storage
   * @template T - Type of the stored value
   * @param {string} storage - Name of the storage to retrieve from
   * @param {string} key - Key of the item to retrieve
   * @returns {Promise<T | null>} A promise that resolves with the stored value or null if not found
   */
  public async getItem<T = unknown>(storage: string, key: string): Promise<T | null> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.getItem<T>(key) ?? null;
  }

  /**
   * Stores an item in the specified storage
   * @template T - Type of the value to store
   * @param {string} storage - Name of the storage to store in
   * @param {string} key - Key under which to store the value
   * @param {T} value - Value to store
   * @returns {Promise<void>} A promise that resolves when the value is stored
   */
  public async setItem<T = unknown>(storage: string, key: string, value: T): Promise<void> {
    const storageInstance = this.getStorage(storage);
    storageInstance?.setItem<T>(key, value);
  }

  /**
   * Deletes an item from the specified storage
   * @param {string} storage - Name of the storage to delete from
   * @param {string} key - Key of the item to delete
   * @returns {Promise<void>} A promise that resolves when the item is deleted
   */
  public async deleteItem(storage: string, key: string): Promise<void> {
    const storageInstance = this.getStorage(storage);
    storageInstance?.deleteItem(key);
  }

  /**
   * Checks if an item exists in the specified storage
   * @param {string} storage - Name of the storage to check
   * @param {string} key - Key to check for
   * @returns {Promise<boolean>} A promise that resolves to true if the item exists, false otherwise
   */
  public async hasItem(storage: string, key: string): Promise<boolean> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.hasItem(key) ?? false;
  }

  /**
   * Retrieves all keys from the specified storage
   * @param {string} storage - Name of the storage to get keys from
   * @returns {Promise<string[]>} A promise that resolves with an array of all keys
   */
  public async getKeys(storage: string): Promise<string[]> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.getKeys()?? [];
  }

  /**
   * Clears all items from the specified storage
   * @param {string} storage - Name of the storage to clear
   * @returns {Promise<void>} A promise that resolves when the storage is cleared
   */
  public async clear(storage: string): Promise<void> {
    const storageInstance = this.getStorage(storage);
    storageInstance?.clear();
  }

  /**
   * Gets the number of items in the specified storage
   * @param {string} storage - Name of the storage to get size of
   * @returns {Promise<number>} A promise that resolves with the number of items
   */
  public async size(storage: string): Promise<number> {
    const storageInstance = this.getStorage(storage);
    return storageInstance?.size()?? 0;
  }

  /**
   * Initializes all registered storage instances
   * Called automatically with @Init() decorator
   * @returns {Promise<void>} A promise that resolves when all storages are initialized
   */
  @Init()
  private async init(): Promise<void> {
    for (const storage of this.fStorages.values()) {
      try {
        await storage?.initialize();
      } catch (error) {
        console.error('Cannot initialize storage', error);
      }
    }
  }

}