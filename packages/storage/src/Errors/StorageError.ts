/**
 * Custom error class for storage-related errors.
 * Wraps underlying storage driver errors with standardized error messages.
 */
export class StorageError extends Error {
  /**
   * The original error that caused this storage error
   */
  public readonly cause?: Error;

  /**
   * The storage operation that failed
   */
  public readonly operation: string;

  /**
   * Additional metadata about the error (non-sensitive)
   */
  public readonly metadata?: Record<string, unknown>;

  constructor(message: string, operation: string, cause?: Error, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'StorageError';
    this.operation = operation;
    this.cause = cause;
    this.metadata = metadata;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StorageError);
    }
  }
}
