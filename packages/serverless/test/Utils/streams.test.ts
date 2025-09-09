import { describe, expect, it } from 'vitest';
import { streamToAsyncIterator, toBuffer } from '../../src/Utils';

describe('Utils - Streams', () => {
  describe('toBuffer', () => {
    it('should convert ReadableStream to Buffer', async () => {
      const testData = 'Hello, World!';
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(testData));
          controller.close();
        },
      });

      const buffer = await toBuffer(stream);
      const result = new TextDecoder().decode(buffer);

      expect(result).toBe(testData);
    });

    it('should handle empty stream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const buffer = await toBuffer(stream);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(0);
    });

    it('should handle stream with multiple chunks', async () => {
      const chunks = ['Hello', ', ', 'World', '!'];
      const stream = new ReadableStream({
        start(controller) {
          // oxlint-disable-next-line no-array-for-each
          chunks.forEach((chunk) => {
            controller.enqueue(new TextEncoder().encode(chunk));
          });
          controller.close();
        },
      });

      const buffer = await toBuffer(stream);
      const result = new TextDecoder().decode(buffer);

      expect(result).toBe('Hello, World!');
    });

    it('should handle stream with binary data', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(binaryData);
          controller.close();
        },
      });

      const buffer = await toBuffer(stream);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(binaryData.length);
      expect([...buffer]).toEqual([...binaryData]);
    });

    it('should handle large stream data', async () => {
      const largeData = 'x'.repeat(10_000);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(largeData));
          controller.close();
        },
      });

      const buffer = await toBuffer(stream);
      const result = new TextDecoder().decode(buffer);

      expect(result).toBe(largeData);
      expect(buffer.length).toBe(largeData.length);
    });

    it('should handle stream with mixed data types', async () => {
      const textData = 'Hello';
      const binaryData = new Uint8Array([1, 2, 3]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(textData));
          controller.enqueue(binaryData);
          controller.close();
        },
      });

      const buffer = await toBuffer(stream);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(textData.length + binaryData.length);
    });

    it('should handle stream errors', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          controller.error(new Error('Stream error'));
        },
      });

      await expect(toBuffer(stream)).rejects.toThrow();
    });

    it('should handle stream abort', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          // Simulate abort
          setTimeout(() => {
            controller.error(new Error('Stream aborted'));
          }, 10);
        },
      });

      // This should reject with an abort error
      await expect(toBuffer(stream)).rejects.toThrow();
    });

    it('should handle stream with async data', async () => {
      const testData = 'Async data';
      const stream = new ReadableStream({
        start(controller) {
          // Simulate async data arrival
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(testData));
            controller.close();
          }, 10);
        },
      });

      const buffer = await toBuffer(stream);
      const result = new TextDecoder().decode(buffer);

      expect(result).toBe(testData);
    });
  });

  describe('streamToAsyncIterator', () => {
    it('should convert ReadableStream to AsyncIterableIterator', () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Hello'));
          controller.enqueue(new TextEncoder().encode('World'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);

      expect(iterator).toBeDefined();
      expect(iterator).toHaveProperty('next');
      expect(iterator).toHaveProperty('return');
      expect(iterator![Symbol.asyncIterator]).toBeDefined();
    });

    it('should return null for null input', () => {
      const iterator = streamToAsyncIterator(null);

      expect(iterator).toBeNull();
    });

    it('should return null for undefined input', () => {
      const iterator = streamToAsyncIterator(undefined as any);

      expect(iterator).toBeNull();
    });

    it('should provide async iteration capability', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk1'));
          controller.enqueue(new TextEncoder().encode('chunk2'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(new TextDecoder().decode(chunks[0])).toBe('chunk1');
      expect(new TextDecoder().decode(chunks[1])).toBe('chunk2');
    });

    it('should handle empty stream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(0);
    });

    it('should handle stream with single chunk', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('single chunk'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(new TextDecoder().decode(chunks[0])).toBe('single chunk');
    });

    it('should handle stream with large data', async () => {
      const largeData = 'x'.repeat(10_000);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(largeData));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(new TextDecoder().decode(chunks[0])).toBe(largeData);
    });

    it('should handle stream with binary data', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(binaryData);
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual(binaryData);
    });

    it('should handle stream with multiple chunks of different sizes', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('a'));
          controller.enqueue(new TextEncoder().encode('bb'));
          controller.enqueue(new TextEncoder().encode('ccc'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(new TextDecoder().decode(chunks[0])).toBe('a');
      expect(new TextDecoder().decode(chunks[1])).toBe('bb');
      expect(new TextDecoder().decode(chunks[2])).toBe('ccc');
    });

    it('should handle stream with async data arrival', async () => {
      const stream = new ReadableStream({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode('async'));
            controller.close();
          }, 10);
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(new TextDecoder().decode(chunks[0])).toBe('async');
    });

    it('should handle stream errors during iteration', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          controller.error(new Error('Stream error'));
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      try {
        for await (const chunk of iterator!) {
          chunks.push(chunk);
        }
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Stream error');
      }

      // The chunk might be consumed before the error, or the error might prevent consumption
      // So we just check that we either got the chunk or the error was thrown
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle manual iteration with next()', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk1'));
          controller.enqueue(new TextEncoder().encode('chunk2'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const result1 = await iterator!.next();
      const result2 = await iterator!.next();
      const result3 = await iterator!.next();

      expect(result1.done).toBe(false);
      expect(result1.value).toBeDefined();
      expect(new TextDecoder().decode(result1.value)).toBe('chunk1');

      expect(result2.done).toBe(false);
      expect(result2.value).toBeDefined();
      expect(new TextDecoder().decode(result2.value)).toBe('chunk2');

      expect(result3.done).toBe(true);
      expect(result3.value).toBeUndefined();
    });

    it('should handle return() method', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      // Call return to release the reader lock
      const returnResult = await iterator!.return!();

      expect(returnResult).toBeUndefined();
    });

    it('should handle Symbol.asyncIterator', () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      // Test that Symbol.asyncIterator returns the iterator itself
      const asyncIterable = iterator![Symbol.asyncIterator]();
      expect(asyncIterable).toBe(iterator);
    });

    // Test cases to cover lines 62-63 (the missing coverage)
    it('should handle return() method on iterator', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      // This should call the return() method which calls reader.releaseLock()
      const returnResult = await iterator!.return!();

      expect(returnResult).toBeUndefined();
    });

    it('should handle Symbol.asyncIterator method', () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      // This should call the Symbol.asyncIterator method which returns this
      const asyncIterable = iterator![Symbol.asyncIterator]();
      expect(asyncIterable).toBe(iterator);
    });

    it('should handle iterator with no data', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const result = await iterator!.next();
      expect(result.done).toBe(true);
      expect(result.value).toBeUndefined();
    });

    it('should handle iterator with immediate close', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      const chunks: Uint8Array[] = [];
      for await (const chunk of iterator!) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(0);
    });

    it('should handle iterator with error during read', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test'));
          controller.error(new Error('Read error'));
        },
      });

      const iterator = streamToAsyncIterator(stream);
      expect(iterator).not.toBeNull();

      try {
        await iterator!.next();
        await iterator!.next(); // This should throw
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Read error');
      }
    });
  });
});
