import { QueueError } from '../Errors/QueueError';
import type { QueueTypes } from '../Types/QueueTypes';

/**
 * Job name a handler registers under to receive every job of its queue that no
 * other handler claims.
 */
export const WILDCARD_JOB = '*';

/** Header carrying the job name across transports that have no native notion of one. */
export const JOB_HEADER = 'x-job';

/** Header carrying the current attempt number. */
export const ATTEMPT_HEADER = 'x-attempt';

/** Header carrying the total number of attempts the publisher asked for. */
export const ATTEMPTS_HEADER = 'x-attempts';

/** Header carrying the partition or routing key a job was published with. */
export const KEY_HEADER = 'x-key';

/** Header carrying the priority a job was published with. */
export const PRIORITY_HEADER = 'x-priority';

/**
 * Most attempts a job may ever take.
 *
 * On transports that do not retry natively the budget is read off the wire, so a
 * producer could otherwise ask for an arbitrarily large one and turn a single
 * poison message into an unbounded republish loop.
 */
export const MAX_ATTEMPTS = 50;

/**
 * Longest a retry may be held back, one day.
 *
 * An exponential backoff over a large attempt count overflows to `Infinity`,
 * which `setTimeout` clamps to one millisecond: the backoff meant to slow
 * retries down would make them as fast as the runtime allows.
 */
export const MAX_BACKOFF_MS = 86_400_000;

/**
 * Reads a positive integer from a raw header value.
 *
 * @param raw - Header value as received from the transport, in any shape.
 * @param fallback - Value returned when the header is absent or unusable.
 * @param max - Largest value accepted, so a value off the wire cannot be unbounded.
 * @returns The parsed integer, or the fallback.
 */
export function readNumericHeader(raw: unknown, fallback: number, max: number = Number.MAX_SAFE_INTEGER): number {
  if (raw === null || raw === undefined) {
    return fallback;
  }

  const value = Number(typeof raw === 'object' ? String(raw) : raw);

  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), max) : fallback;
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
 * @returns Delay in milliseconds, zero when no backoff is configured and never above {@link MAX_BACKOFF_MS}.
 */
export function resolveBackoff(backoff: QueueTypes.Backoff | undefined, attempt: number): number {
  if (!backoff) {
    return 0;
  }

  if (typeof backoff === 'number') {
    return Math.min(Math.max(0, backoff), MAX_BACKOFF_MS);
  }

  const delay = Math.max(0, backoff.delay);
  const resolved = backoff.type === 'exponential' ? delay * 2 ** Math.max(0, attempt - 1) : delay;

  return Math.min(resolved, MAX_BACKOFF_MS);
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

/**
 * Drops the keys whose value is undefined.
 *
 * Options objects are built by spreading whatever the caller set, which leaves
 * own properties holding `undefined` behind. A library that merges options with
 * `Object.assign` cannot tell those apart from a deliberate value, so they have
 * to go before the object is handed over.
 *
 * @param source - Object to clean up.
 * @returns A copy without the undefined entries.
 */
export function prune<T extends Record<string, unknown>>(source: T): T {
  const pruned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      pruned[key] = value;
    }
  }

  return pruned as T;
}
