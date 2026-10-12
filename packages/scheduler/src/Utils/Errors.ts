import { SchedulerError } from '../Errors/SchedulerError';

/**
 * Turns any thrown value into a {@link SchedulerError}, leaving scheduler errors
 * alone so their operation survives.
 *
 * @param error - The value that was thrown.
 * @param message - Message of the resulting error.
 * @param operation - Scheduler operation that failed.
 * @param metadata - Additional non-sensitive context.
 * @returns The error to throw.
 */
export function toSchedulerError(
  error: unknown,
  message: string,
  operation: string,
  metadata?: Record<string, unknown>,
): SchedulerError {
  return error instanceof SchedulerError ? error : new SchedulerError(message, operation, error as Error, metadata);
}

/**
 * Turns any thrown value into an `Error`, so a handler throwing a string is
 * still reported with a message.
 *
 * @param error - The value that was thrown.
 * @returns The value itself when it is an error, a wrapping error otherwise.
 */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
