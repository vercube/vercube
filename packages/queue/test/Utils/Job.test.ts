import { describe, expect, it } from 'vitest';
import { QueueError } from '../../src/Errors/QueueError';
import {
  decodePayload,
  delay,
  encodePayload,
  generateJobId,
  MAX_BACKOFF_MS,
  normalizeHeaders,
  prune,
  readNumericHeader,
  resolveBackoff,
} from '../../src/Utils/Job';

describe('Job utils', () => {
  describe('readNumericHeader', () => {
    it('should read numbers and numeric strings', () => {
      expect(readNumericHeader(3, 1)).toBe(3);
      expect(readNumericHeader('4', 1)).toBe(4);
      expect(readNumericHeader(Buffer.from('5'), 1)).toBe(5);
    });

    it('should fall back for missing or unusable values', () => {
      expect(readNumericHeader(undefined, 7)).toBe(7);
      expect(readNumericHeader(null, 7)).toBe(7);
      expect(readNumericHeader('nope', 7)).toBe(7);
      expect(readNumericHeader(0, 7)).toBe(7);
      expect(readNumericHeader(-2, 7)).toBe(7);
    });

    it('should floor fractional values', () => {
      expect(readNumericHeader('2.9', 1)).toBe(2);
    });
  });

  describe('clamping', () => {
    it('should never read more than the maximum from a header', () => {
      // The value comes off the wire, so a producer must not be able to ask for
      // an arbitrarily large retry budget.
      expect(readNumericHeader('1000000', 1, 50)).toBe(50);
    });

    it('should still read a value below the maximum as it is', () => {
      expect(readNumericHeader('7', 1, 50)).toBe(7);
    });

    it('should never hold a retry longer than a day', () => {
      // An unclamped exponential overflows to Infinity, which setTimeout turns
      // into one millisecond: the slowest backoff becomes the fastest.
      expect(resolveBackoff({ type: 'exponential', delay: 1000 }, 60)).toBe(MAX_BACKOFF_MS);
      expect(Number.isFinite(resolveBackoff({ type: 'exponential', delay: 1000 }, 60))).toBe(true);
    });

    it('should clamp a fixed backoff too', () => {
      expect(resolveBackoff(MAX_BACKOFF_MS * 3, 1)).toBe(MAX_BACKOFF_MS);
    });
  });

  describe('prune', () => {
    it('should drop the keys holding undefined', () => {
      expect(prune({ attempts: 3, delay: undefined, priority: 0 })).toEqual({ attempts: 3, priority: 0 });
    });

    it('should keep null, which is a value somebody chose', () => {
      expect(prune({ removeOnComplete: null })).toEqual({ removeOnComplete: null });
    });
  });

  describe('normalizeHeaders', () => {
    it('should turn every value into a string', () => {
      expect(normalizeHeaders({ 'x-attempt': 2, 'x-job': Buffer.from('welcome') })).toEqual({
        'x-attempt': '2',
        'x-job': 'welcome',
      });
    });

    it('should drop empty values and handle missing headers', () => {
      expect(normalizeHeaders({ a: null, b: undefined, c: 'keep' })).toEqual({ c: 'keep' });
      expect(normalizeHeaders(undefined)).toEqual({});
      expect(normalizeHeaders(null)).toEqual({});
    });
  });

  describe('resolveBackoff', () => {
    it('should treat a number as a fixed delay', () => {
      expect(resolveBackoff(500, 1)).toBe(500);
      expect(resolveBackoff(500, 4)).toBe(500);
    });

    it('should double an exponential delay on every attempt', () => {
      expect(resolveBackoff({ type: 'exponential', delay: 100 }, 1)).toBe(100);
      expect(resolveBackoff({ type: 'exponential', delay: 100 }, 2)).toBe(200);
      expect(resolveBackoff({ type: 'exponential', delay: 100 }, 3)).toBe(400);
    });

    it('should keep a fixed policy flat', () => {
      expect(resolveBackoff({ type: 'fixed', delay: 100 }, 3)).toBe(100);
    });

    it('should return zero without a policy and never go negative', () => {
      expect(resolveBackoff(undefined, 1)).toBe(0);
      expect(resolveBackoff(-5, 1)).toBe(0);
      expect(resolveBackoff({ type: 'fixed', delay: -5 }, 1)).toBe(0);
    });
  });

  describe('payload encoding', () => {
    it('should round-trip a payload', () => {
      const encoded = encodePayload({ id: 1, nested: ['a'] });

      expect(decodePayload(encoded)).toEqual({ id: 1, nested: ['a'] });
    });

    it('should encode missing payloads as null', () => {
      expect(decodePayload(encodePayload(undefined))).toBeNull();
    });

    it('should reject payloads that cannot be serialized', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(() => encodePayload(circular)).toThrow(QueueError);
    });

    it('should return non-JSON content as text', () => {
      expect(decodePayload('not json')).toBe('not json');
    });

    it('should treat empty and missing content as null', () => {
      expect(decodePayload('')).toBeNull();
      expect(decodePayload(null)).toBeNull();
      expect(decodePayload(undefined)).toBeNull();
    });
  });

  describe('generateJobId', () => {
    it('should generate unique ids', () => {
      expect(generateJobId()).not.toBe(generateJobId());
    });
  });

  describe('delay', () => {
    it('should resolve immediately for non-positive waits', async () => {
      await expect(delay(0)).resolves.toBeUndefined();
      await expect(delay(-10)).resolves.toBeUndefined();
    });

    it('should wait for the given time', async () => {
      const started = Date.now();

      await delay(15);

      expect(Date.now() - started).toBeGreaterThanOrEqual(10);
    });
  });
});
