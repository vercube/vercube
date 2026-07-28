/**
 * Custom error class for cache-related errors.
 * Wraps underlying cache/storage errors with standardized error messages.
 */
export class CacheError extends Error {
  /**
   * The original error that caused this cache error
   */
  public readonly cause?: Error;

  /**
   * The cache operation that failed
   */
  public readonly operation: string;

  /**
   * Additional metadata about the error (non-sensitive)
   */
  public readonly metadata?: Record<string, unknown>;

  constructor(message: string, operation: string, cause?: Error, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'CacheError';
    this.operation = operation;
    this.cause = cause;
    this.metadata = metadata;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CacheError);
    }
  }
}
