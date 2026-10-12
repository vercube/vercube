/**
 * Error thrown by the scheduler module.
 * Gives every failure a stable shape, so callers can tell what failed and
 * whether trying again could help.
 */
export class SchedulerError extends Error {
  /** The original error that caused this one. */
  public readonly cause?: Error;

  /**
   * The scheduler operation that failed, for example `register`, `start`,
   * `claim`, or the reason a run was aborted: `timeout`, `lock-lost` or `shutdown`.
   */
  public readonly operation: string;

  /** Whether trying the operation again could succeed. */
  public readonly retryable: boolean;

  /** Additional non-sensitive context about the failure. */
  public readonly metadata?: Record<string, unknown>;

  /**
   * @param message - Human readable description of the failure.
   * @param operation - Scheduler operation that failed.
   * @param cause - Underlying error, when there is one.
   * @param metadata - Additional non-sensitive context.
   * @param retryable - Whether trying again could succeed, defaults to true.
   */
  constructor(message: string, operation: string, cause?: Error, metadata?: Record<string, unknown>, retryable: boolean = true) {
    super(message);
    this.name = 'SchedulerError';
    this.operation = operation;
    this.cause = cause;
    this.metadata = metadata;
    this.retryable = retryable;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SchedulerError);
    }
  }
}
