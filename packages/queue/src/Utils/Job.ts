import { QueueError } from '../Errors/QueueError';
import type { QueueTypes } from '../Types/QueueTypes';

/** Header carrying the job name across transports that have no native notion of one. */
export const JOB_HEADER = 'x-job';

/** Header carrying the current attempt number. */
export const ATTEMPT_HEADER = 'x-attempt';

/** Header carrying the total number of attempts the publisher asked for. */
export const ATTEMPTS_HEADER = 'x-attempts';

/**
 * Reads a positive integer from a raw header value.
 *
 * @param raw - Header value as received from the transport, in any shape.
 * @param fallback - Value returned when the header is absent or unusable.
 * @returns The parsed integer, or the fallback.
 */
export function readNumericHeader(raw: unknown, fallback: number): number {
  if (raw === null || raw === undefined) {
    return fallback;
  }

  const value = Number(typeof raw === 'object' ? String(raw) : raw);

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Normalizes transport headers into plain strings, so handlers never have to deal
 * with buffers or numbers coming from the wire.
 *
 * @param headers - Raw headers as received from the transport.
 * @returns Headers with string values only.
 */
export function normalizeHeaders(headers: Record<string, unknown> | undefined | null): Record<string, string> {
  if (!headers) {
    return {};
  }

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value !== null && value !== undefined) {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

/**
 * Computes how long to wait before the next attempt of a job.
 *
 * @param backoff - Backoff policy, a number being a fixed delay in milliseconds.
 * @param attempt - Attempt that just failed, starting at 1.
 * @returns Delay in milliseconds, zero when no backoff is configured.
 */
export function resolveBackoff(backoff: QueueTypes.Backoff | undefined, attempt: number): number {
  if (!backoff) {
    return 0;
  }

  if (typeof backoff === 'number') {
    return Math.max(0, backoff);
  }

  const delay = Math.max(0, backoff.delay);

  return backoff.type === 'exponential' ? delay * 2 ** Math.max(0, attempt - 1) : delay;
}

/**
 * Serializes a payload for transports that only carry bytes.
 *
 * @param payload - Payload to serialize.
 * @returns The payload as a UTF-8 JSON buffer.
 * @throws {QueueError} When the payload cannot be serialized.
 */
export function encodePayload(payload: unknown): Buffer {
  try {
    return Buffer.from(JSON.stringify(payload ?? null), 'utf8');
  } catch (error) {
    throw new QueueError('Job payload is not serializable', 'encode', error as Error, undefined, false);
  }
}

/**
 * Deserializes a payload received from a transport that only carries bytes.
 * Content that is not JSON is returned as text, so foreign producers do not
 * break the consumer.
 *
 * @param content - Raw bytes received from the transport.
 * @returns The parsed payload, or the raw text when it is not JSON.
 */
export function decodePayload(content: Uint8Array | Buffer | string | null | undefined): unknown {
  if (content === null || content === undefined) {
    return null;
  }

  const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Generates an id for transports that do not assign one themselves.
 *
 * @returns A unique job id.
 */
export function generateJobId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Waits for the given number of milliseconds.
 *
 * @param ms - Milliseconds to wait, values below one resolve immediately.
 * @returns Resolves once the delay elapsed.
 */
export function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // a pending retry must never hold the process open on its own
    timer.unref?.();
  });
}
