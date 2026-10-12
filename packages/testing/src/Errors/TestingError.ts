import type { TestingTypes } from '../Types/TestingTypes';

/**
 * Error thrown by `@vercube/testing`: a failed expectation, a dependency that
 * was not stubbed, or an application that failed to boot.
 *
 * The request and response a failed expectation was about are kept as
 * properties, so runners that print error properties show them.
 */
export class TestingError extends Error {
  /** The original error that caused this one. */
  public readonly cause?: unknown;

  /** The boot phase that failed, when `createTestApp()` failed. */
  public readonly phase?: TestingTypes.BootPhase;

  /** The request a failed expectation was about. */
  public readonly request?: TestingTypes.RequestSnapshot;

  /** The response a failed expectation was about, with its body read. */
  public readonly response?: TestingTypes.ResponseSnapshot;

  /**
   * @param message - Human readable description of the failure.
   * @param options - What the failure was about.
   * @param options.cause - Underlying error, when there is one.
   * @param options.phase - Boot phase that failed.
   * @param options.request - Request a failed expectation was about.
   * @param options.response - Response a failed expectation was about.
   */
  constructor(
    message: string,
    options: {
      cause?: unknown;
      phase?: TestingTypes.BootPhase;
      request?: TestingTypes.RequestSnapshot;
      response?: TestingTypes.ResponseSnapshot;
    } = {},
  ) {
    super(message);
    this.name = 'TestingError';
    this.cause = options.cause;
    this.phase = options.phase;
    this.request = options.request;
    this.response = options.response;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TestingError);
    }
  }
}
