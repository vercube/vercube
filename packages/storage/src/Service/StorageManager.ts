import { Container, Destroy, Init, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { traceOperation } from '../Common/Instrument';
import { StorageError } from '../Errors/StorageError';
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
   * The application's health check registry, bound by `@vercube/core` under a
   * string key so storage stays independent of core at runtime
   */
  @InjectOptional('vercube:health')
  protected gHealth!: StorageTypes.HealthRegistryLike | null;

  /**
   * Removes the health check of each mount that registered one
   */
  protected fHealthChecks: Map<string, () => void> = new Map();

  /**
   * Map of registered storage instances indexed by their names
   */
  protected fStorages: Map<string, StorageTypes.Storages> = new Map();

  /**
   * Mounts whose storage failed to initialize, with the error every operation on them rethrows
   */
  protected fFailed: Map<string, StorageError> = new Map();

  /**
   * Whether the mounts present at container flush have been initialized; later
   * mounts are initialized as they are mounted
   */
  protected fInitialized: boolean = false;

  /**
   * Mounts already warned about a non-atomic increment
   */
  protected fNonAtomicWarned: Set<string> = new Set();

  /**
   * Mounts a new storage instance with the specified name
   * @param {StorageTypes.Mount} params - Mount parameters containing name and storage implementation
   * @param {string} [params.name] - Optional name for the storage instance, defaults to 'default'
   * @param {IOC.Newable<Storage>} params.storage - Storage implementation to mount
   * @returns {Promise<void>} A promise that resolves when mounting is complete
   * @throws {StorageError} When mounted after startup and the storage fails to initialize
   */
  public async mount<T extends Storage<unknown>>({ name, storage, initOptions, health }: StorageTypes.Mount<T>): Promise<void> {
    const mountName = name ?? 'default';
    const instance = this.gContainer.resolve(storage);
    const previous = this.fStorages.get(mountName)?.storage;

    // the driver mounted before under the name may hold a connection nobody else can close
    if (previous) {
      await this.closeDriver(mountName, previous);
    }

    this.fStorages.set(mountName, { storage: instance, initOptions });
    this.fFailed.delete(mountName);
    this.registerHealthCheck(mountName, instance, health);

    // the storages present at startup are initialized by init(), a later one here
    if (this.fInitialized) {
      await this.initializeMount(mountName, instance, initOptions);
    }
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
          getKeys?: (options?: { limit?: number }) => string[] | Promise<string[]>;
          size?: () => number | Promise<number>;
          cheapSize?: boolean;
        };

        // one key past the cap tells whether the list was cut short
        const keys = typeof driver.getKeys === 'function' ? await safely(() => driver.getKeys!({ limit: maxKeys + 1 })) : null;
        const truncated = keys ? keys.length > maxKeys : false;

        let size: number | null = null;

        if (keys && !truncated) {
          size = keys.length;
        } else if (typeof driver.size === 'function' && driver.cheapSize !== false) {
          size = await safely(() => driver.size!());
        }

        return {
          name,
          driver: (mount.storage as object)?.constructor?.name ?? 'Storage',
          size,
          keys: keys ? keys.slice(0, maxKeys) : null,
          truncated,
          atomicIncrement: this.isAtomic(name),
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
    return this.trace('getItem', storage, key, async () => {
      const storageInstance = this.requireStorage(storage, 'getItem');
      return (await storageInstance.getItem<T>(key)) ?? null;
    });
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
    return this.trace('getItems', storage, undefined, async () => {
      const storageInstance = this.requireStorage(storage, 'getItems');
      return (await storageInstance.getItems<T>(keys)) ?? [];
    });
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
    await this.trace('setItem', storage, key, async () => {
      const storageInstance = this.requireStorage(storage, 'setItem');
      await storageInstance.setItem<T, U>(key, value, options);
    });
  }

  /**
   * Adds to a numeric counter and returns the new value.
   *
   * Atomic when the driver implements `increment` (memory, Redis). Any other
   * driver gets a read followed by a write, which two instances can interleave
   * (a warning is logged once per mount), and every write sets the expiry again.
   * Not traced, because it sits on hot
   * paths such as rate limiting where a span per request costs more than the call.
   *
   * @param {StorageTypes.Increment} params - Parameters of the increment
   * @param {string} [params.storage] - Name of the storage, defaults to 'default'
   * @param {string} params.key - Counter key
   * @param {number} [params.by] - Amount added, 1 when omitted
   * @param {number} [params.ttl] - Seconds until a counter this call creates expires
   * @returns {Promise<number>} The value after the increment
   * @throws {StorageError} When the mount does not exist or failed to initialize
   */
  public async increment({ storage, key, by = 1, ttl }: StorageTypes.Increment): Promise<number> {
    const storageInstance = this.requireStorage(storage, 'increment');

    if (!Number.isFinite(by)) {
      throw new StorageError(`Cannot increment "${key}" by ${by}`, 'increment', undefined, { mount: storage ?? 'default' });
    }

    if (typeof storageInstance.increment === 'function') {
      return storageInstance.increment(key, { by, ttl });
    }

    const name = storage ?? 'default';

    if (!this.fNonAtomicWarned.has(name)) {
      this.fNonAtomicWarned.add(name);
      this.gLogger?.warn(
        'Vercube/StorageManager::increment',
        `Storage "${name}" has no atomic increment: counters are read and written separately and can lose updates across instances`,
      );
    }

    const current = Number((await storageInstance.getItem<number>(key)) ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + by;

    // A plain write cannot keep the old expiry, so it is set again on every
    // write: later than an atomic driver would expire the key, never immortal.
    await storageInstance.setItem<number, StorageTypes.WriteOptions>(key, next, ttl ? { ttl } : undefined);

    return next;
  }

  /**
   * Tells whether a mount increments counters atomically.
   *
   * @param {string} [name] - Name of the mount, `default` when omitted
   * @returns {boolean} True when the driver implements `increment`
   */
  public isAtomic(name: string = 'default'): boolean {
    return typeof this.getStorage(name)?.increment === 'function';
  }

  /**
   * Deletes an item from the specified storage
   * @param {StorageTypes.DeleteItem} params - Parameters for deleting an item
   * @param {string} [params.storage] - Name of the storage to delete from, defaults to 'default'
   * @param {string} params.key - Key of the item to delete
   * @returns {Promise<void>} A promise that resolves when the item is deleted
   */
  public async deleteItem({ storage, key }: StorageTypes.DeleteItem): Promise<void> {
    await this.trace('deleteItem', storage, key, async () => {
      const storageInstance = this.requireStorage(storage, 'deleteItem');
      await storageInstance.deleteItem(key);
    });
  }

  /**
   * Checks if an item exists in the specified storage
   * @param {StorageTypes.HasItem} params - Parameters for checking item existence
   * @param {string} [params.storage] - Name of the storage to check, defaults to 'default'
   * @param {string} params.key - Key to check for
   * @returns {Promise<boolean>} A promise that resolves to true if the item exists, false otherwise
   */
  public async hasItem({ storage, key }: StorageTypes.HasItem): Promise<boolean> {
    return this.requireStorage(storage, 'hasItem').hasItem(key);
  }

  /**
   * Retrieves all keys from the specified storage
   * @param {StorageTypes.GetKeys} params - Parameters for retrieving keys
   * @param {string} [params.storage] - Name of the storage to get keys from, defaults to 'default'
   * @returns {Promise<string[]>} A promise that resolves with an array of all keys
   */
  public async getKeys({ storage }: StorageTypes.GetKeys): Promise<string[]> {
    return this.requireStorage(storage, 'getKeys').getKeys();
  }

  /**
   * Clears all items from the specified storage
   * @param {StorageTypes.Clear} params - Parameters for clearing storage
   * @param {string} [params.storage] - Name of the storage to clear, defaults to 'default'
   * @returns {Promise<void>} A promise that resolves when the storage is cleared
   */
  public async clear({ storage }: StorageTypes.Clear): Promise<void> {
    await this.requireStorage(storage, 'clear').clear();
  }

  /**
   * Gets the number of items in the specified storage
   * @param {StorageTypes.Size} params - Parameters for getting storage size
   * @param {string} [params.storage] - Name of the storage to get size of, defaults to 'default'
   * @returns {Promise<number>} A promise that resolves with the number of items
   */
  public async size({ storage }: StorageTypes.Size): Promise<number> {
    return this.requireStorage(storage, 'size').size();
  }

  /**
   * Checks that the backend of a mount answers. Resolves without a round trip
   * for a driver that has no backend.
   *
   * @param {string} [name] - Name of the mount, `default` when omitted
   * @returns {Promise<void>} Resolves once the backend answered
   * @throws {StorageError} When the mount does not exist or failed to initialize, or the backend does not answer
   */
  public async ping(name: string = 'default'): Promise<void> {
    if (!this.fInitialized) {
      throw new StorageError(`Storage "${name}" is not initialized yet`, 'ping', undefined, { mount: name });
    }

    await this.requireStorage(name, 'ping').ping?.();
  }

  /**
   * Registers the readiness check of a mount whose driver talks to a backend,
   * replacing the one an earlier mount under the name registered.
   *
   * @param {string} name - Name of the mount
   * @param {Storage} storage - The mounted driver
   * @param {StorageTypes.HealthOption} [option] - The mount's `health` option
   * @returns {void}
   * @protected
   */
  protected registerHealthCheck(name: string, storage: Storage, option?: StorageTypes.HealthOption): void {
    this.fHealthChecks.get(name)?.();
    this.fHealthChecks.delete(name);

    if (!this.gHealth || option === false || typeof storage.ping !== 'function') {
      return;
    }

    const settings = typeof option === 'object' ? option : {};

    this.fHealthChecks.set(
      name,
      this.gHealth.register({
        name: `storage:${name}`,
        critical: settings.critical !== false,
        ...(settings.timeout === undefined ? {} : { timeout: settings.timeout }),
        check: () => this.ping(name),
      }),
    );
  }

  /**
   * Initializes all registered storage instances
   * Called automatically with @Init() decorator
   * @returns {Promise<void>} A promise that resolves when all storages are initialized
   */
  @Init()
  protected async init(): Promise<void> {
    this.fInitialized = true;

    for (const [name, { storage, initOptions }] of this.fStorages) {
      try {
        await this.initializeMount(name, storage, initOptions);
      } catch {
        // already logged and recorded: every operation on this mount throws it
      }
    }
  }

  /**
   * Closes every mounted driver that holds something to release, such as a
   * connection. Called once when the application shuts down; a driver that
   * fails to close is logged and does not stop the others.
   * @returns {Promise<void>} Resolves once every driver was closed
   */
  @Destroy()
  public async close(): Promise<void> {
    await Promise.all([...this.fStorages.entries()].map(([name, { storage }]) => this.closeDriver(name, storage)));
  }

  /**
   * Closes one driver, logging a failure instead of throwing it.
   * @param {string} name - Name of the mount
   * @param {Storage} storage - The driver
   * @returns {Promise<void>} Resolves once closed or failed
   * @protected
   */
  protected async closeDriver(name: string, storage: Storage): Promise<void> {
    try {
      await storage.close?.();
    } catch (error) {
      this.gLogger?.error(
        'Vercube/StorageManager::close',
        new StorageError(`Failed to close storage "${name}"`, 'close', error as Error, { mount: name }),
      );
    }
  }

  /**
   * Initializes a mounted storage. A failure is logged and recorded, so every
   * later operation on the mount fails with it instead of hitting a broken driver.
   * @param {string} name - Name of the mount
   * @param {Storage} storage - The storage to initialize
   * @param {unknown} initOptions - Options to initialize it with
   * @returns {Promise<void>} Resolves once initialized
   * @throws {StorageError} When the storage fails to initialize
   * @protected
   */
  protected async initializeMount(name: string, storage: Storage | undefined, initOptions: unknown): Promise<void> {
    try {
      await storage?.initialize(initOptions as never);
    } catch (error) {
      const failure = new StorageError(`Failed to initialize storage "${name}"`, 'initialize', error as Error, { mount: name });

      this.fFailed.set(name, failure);
      this.gLogger?.error('Vercube/StorageManager::init', failure);

      throw failure;
    }
  }

  /**
   * Returns a mounted storage, failing loudly for a name that is not mounted
   * or a storage that failed to initialize, so a typo never silently drops data.
   * @param {string} [name] - Name of the mount, `default` when omitted
   * @param {string} operation - The operation asking for it
   * @returns {Storage} The storage
   * @throws {StorageError} When the mount does not exist or failed to initialize
   * @protected
   */
  protected requireStorage(name: string = 'default', operation: string): Storage {
    const failure = this.fFailed.get(name);

    if (failure) {
      throw failure;
    }

    const storage = this.getStorage(name);

    if (!storage) {
      throw new StorageError(`Storage "${name}" is not mounted`, operation, undefined, { mount: name });
    }

    return storage;
  }
  /**
   * Wraps a storage operation in a span.
   *
   * Mount and driver are recorded, the key is not: keys routinely contain user
   * and tenant identifiers, and a span attribute is the wrong place for them.
   * @param {string} operation - Operation name
   * @param {string} [mount] - Mount the operation targets
   * @param {string} [key] - Key involved, used only to count it
   * @param {Function} fn - The work to trace
   * @returns {Promise<T>} Whatever `fn` returned
   * @private
   */
  private trace<T>(operation: string, mount: string | undefined, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    const name = mount ?? 'default';

    return traceOperation(
      `storage.${operation}`,
      {
        'vercube.storage.operation': operation,
        'vercube.storage.mount': name,
        'vercube.storage.driver': (this.fStorages.get(name)?.storage as object)?.constructor?.name,
        'vercube.storage.keyed': key !== undefined,
      },
      fn,
    );
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
