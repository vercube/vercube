import { defineErrorCatalog } from '@vercube/di';
import { StorageError } from './StorageError';

/** What a call site hands to an error of the storage manager. */
interface Failure {
  /** The storage operation that failed, kept on the error as `operation`. */
  operation: string;
  /** Non-sensitive context, kept on the error as `metadata`. */
  metadata?: Record<string, unknown>;
}

/** What a call site hands to an error that wraps one thrown by a driver. */
interface Wrapped {
  /** The value the driver threw, kept on the error as `cause`. */
  cause: unknown;
  /** Non-sensitive context, kept on the error as `metadata`. */
  metadata?: Record<string, unknown>;
}

/**
 * Builds the `create` of an entry that wraps what a driver threw.
 *
 * @param {string} operation - The storage operation that failed
 * @returns {Function} The `create` of a catalog entry
 */
function wrapped(operation: string): (message: string, params: Wrapped) => StorageError {
  return (message, params) => new StorageError(message, operation, params.cause as Error, params.metadata);
}

/**
 * The errors of the storage module.
 */
export const StorageErrors = defineErrorCatalog('VERCUBE_STORAGE', {
  NOT_MOUNTED: {
    message: ({ name }: Failure & { name: string }) => `Storage "${name}" is not mounted`,
    why: 'An operation named a storage that nothing is mounted under. A call without a `storage` name goes to the mount called `default`.',
    fix: 'Mount it before it is used: `await container.get(StorageManager).mount({ name, storage: MemoryStorage })`. Or correct the `storage` name of the call, `StorageManager.mounts` lists the names that exist.',
    create: (message, params: Failure) => new StorageError(message, params.operation, undefined, params.metadata),
  },
  NOT_INITIALIZED: {
    message: ({ name }: { name: string }) => `Storage "${name}" is not initialized yet`,
    why: '`StorageManager.ping()` was called before the container initialized the manager, so no mounted driver has connected yet.',
    fix: 'Call `ping()` after the application has started. With a container built by hand, call `initializeContainer(container)` from `@vercube/di` first.',
    create: (message, params: { name: string }) => new StorageError(message, 'ping', undefined, { mount: params.name }),
  },
  INIT_FAILED: {
    message: ({ name }: Wrapped & { name: string }) => `Failed to initialize storage "${name}"`,
    why: 'The `initialize()` method of the mounted driver threw, usually because its backend cannot be reached or its options are wrong. The original error is the `cause`. Every later operation on the mount fails with this error.',
    fix: 'Read the `cause`, then correct the `initOptions` given to `StorageManager.mount()` for that name, or make the backend reachable. Mounting the storage again clears the failure.',
    create: (message, params: Wrapped & { name: string }) =>
      new StorageError(message, 'initialize', params.cause as Error, { mount: params.name }),
  },
  CLOSE_FAILED: {
    message: ({ name }: Wrapped & { name: string }) => `Failed to close storage "${name}"`,
    why: 'The `close()` method of a mounted driver threw while the manager was shutting down, or while another storage was mounted under the same name. The error is logged and the other drivers are still closed.',
    fix: 'Read the `cause`. For a driver of your own, make `close()` safe to call when the connection is already gone.',
    create: (message, params: Wrapped & { name: string }) =>
      new StorageError(message, 'close', params.cause as Error, { mount: params.name }),
  },
  INCREMENT_INVALID: {
    message: ({ key, by }: { key: string; by: number; mount: string }) => `Cannot increment "${key}" by ${by}`,
    why: '`StorageManager.increment()` was called with a `by` that is `NaN` or `Infinity`. A counter can only move by a finite number.',
    fix: 'Pass a finite number as `by` to `StorageManager.increment()`, or leave it out to add `1`.',
    create: (message, params: { mount: string }) => new StorageError(message, 'increment', undefined, { mount: params.mount }),
  },
  REDIS_NOT_INITIALIZED: {
    message: 'RedisStorage is not initialized',
    why: 'The `client` of `RedisStorage` was read before its `initialize()` connected, or after `close()`. That happens when the storage is created by hand and not mounted.',
    fix: 'Mount it: `StorageManager.mount({ name, storage: RedisStorage, initOptions: { url } })`, and use it once the application has started.',
    create: (message) => new StorageError(message, 'client'),
  },
  S3_ITEM_NOT_JSON: {
    message: ({ key }: Wrapped & { key: string }) => `Failed to parse item "${key}" from S3: the object is not valid JSON`,
    why: '`S3Storage` stores every value as JSON, and the object under this key is something else. It was written by another tool, or by hand.',
    fix: 'Write the value again with `setItem()`, or keep objects that are not JSON in a bucket or under a key that `S3Storage` does not read.',
    create: wrapped('getItem'),
  },
  S3_GET_FAILED: {
    message: ({ errorName }: Wrapped & { errorName: string }) => `Failed to retrieve item from S3: ${errorName}`,
    why: 'S3 answered the `GetObject` request with an error other than a missing key. The name of that error ends the message, and its HTTP status is in `metadata.statusCode`.',
    fix: 'Check the `bucket`, `region` and `credentials` in the `initOptions` of `S3Storage`, and that the credentials allow `s3:GetObject` on the bucket.',
    create: wrapped('getItem'),
  },
  S3_HAS_FAILED: {
    message: ({ errorName }: Wrapped & { errorName: string }) => `Failed to check item existence in S3: ${errorName}`,
    why: 'S3 answered the `HeadObject` request with an error other than a missing key. The name of that error ends the message, and its HTTP status is in `metadata.statusCode`.',
    fix: 'Check the `bucket`, `region` and `credentials` in the `initOptions` of `S3Storage`, and that the credentials allow `s3:GetObject` on the bucket.',
    create: wrapped('hasItem'),
  },
  S3_CLEAR_INCOMPLETE: {
    message: ({ count }: { count: number; metadata: Record<string, unknown> }) => `Failed to delete ${count} items from S3`,
    why: 'S3 accepted the `DeleteObjects` request of `clear()` and reported some keys it did not delete. The error code of the first one is in `metadata.errorName`.',
    fix: 'Check that the credentials in the `initOptions` of `S3Storage` allow `s3:DeleteObject` on the bucket, and that no object lock or retention policy protects the objects.',
    create: (message, params: { metadata: Record<string, unknown> }) =>
      new StorageError(message, 'clear', undefined, params.metadata),
  },
});
