/**
 * Error thrown by the queue module.
 * Wraps transport errors with a stable shape so callers can tell what failed
 * and whether the job is worth retrying.
 */
export class QueueError extends Error {
  /** The original error that caused this one. */
  public readonly cause?: Error;

  /** The queue operation that failed, for example `publish` or `consume`. */
  public readonly operation: string;

  /** Whether processing the job again could succeed. */
  public readonly retryable: boolean;

  /** Additional non-sensitive context about the failure. */
  public readonly metadata?: Record<string, unknown>;

  /**
   * @param message - Human readable description of the failure.
   * @param operation - Queue operation that failed.
   * @param cause - Underlying error, when there is one.
   * @param metadata - Additional non-sensitive context.
   * @param retryable - Whether processing the job again could succeed, defaults to true.
   */
  constructor(message: string, operation: string, cause?: Error, metadata?: Record<string, unknown>, retryable: boolean = true) {
    super(message);
    this.name = 'QueueError';
    this.operation = operation;
    this.cause = cause;
    this.metadata = metadata;
    this.retryable = retryable;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QueueError);
    }
  }
}
