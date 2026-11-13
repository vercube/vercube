/**
 * Error thrown by the rate limit module for a misconfiguration, such as an
 * invalid window or limit. Requests over the limit get a `TooManyRequestsError`
 * instead, and a failing storage a `ServiceUnavailableError` or nothing at all.
 */
export class RateLimitError extends Error {
  /** The operation that failed, for example `configure`. */
  public readonly operation: string;

  /** Additional non-sensitive context about the failure. */
  public readonly metadata?: Record<string, unknown>;

  /**
   * @param message - Human readable description of the failure.
   * @param operation - Operation that failed.
   * @param metadata - Additional non-sensitive context.
   */
  constructor(message: string, operation: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'RateLimitError';
    this.operation = operation;
    this.metadata = metadata;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError);
    }
  }
}
