import { QueueError } from '../Errors/QueueError';

/**
 * Turns any thrown value into a {@link QueueError}, leaving queue errors alone so
 * their operation and `retryable` flag survive.
 *
 * @param error - The value that was thrown.
 * @param message - Message of the resulting error.
 * @param operation - Queue operation that failed.
 * @param metadata - Additional non-sensitive context.
 * @returns The error to throw.
 */
export function toQueueError(error: unknown, message: string, operation: string, metadata?: Record<string, unknown>): QueueError {
  return error instanceof QueueError ? error : new QueueError(message, operation, error as Error, metadata);
}
