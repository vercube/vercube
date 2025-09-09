/**
 * Converts a ReadableStream to a Buffer using Web Streams API.
 *
 * This function reads all chunks from a ReadableStream and concatenates them
 * into a single Buffer. It uses the modern Web Streams API with WritableStream
 * to efficiently process the stream data without blocking.
 *
 * The function handles stream errors gracefully and provides proper cleanup
 * of stream resources. It's designed to work with Response.body streams
 * from fetch API responses.
 *
 * @param data - The ReadableStream to convert to a Buffer
 * @returns A promise that resolves to a Buffer containing all stream data
 * @throws {Error} If the stream cannot be read or an error occurs during processing
 */
export function toBuffer(data: ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    // Create a WritableStream to collect chunks
    const writableStream = new WritableStream({
      write(chunk: Buffer) {
        chunks.push(chunk);
      },
      close() {
        // Concatenate all chunks into a single buffer
        resolve(Buffer.concat(chunks));
      },
      abort(reason: any) {
        reject(new Error('Stream aborted: ' + String(reason)));
      },
    });

    // Pipe the readable stream to the writable stream
    data.pipeTo(writableStream).catch(reject);
  });
}

/**
 * Converts a ReadableStream to an AsyncIterableIterator for platform compatibility.
 *
 * Some serverless platforms expect response bodies to be AsyncIterableIterator<Uint8Array>.
 * This function wraps a standard web ReadableStream to provide the required interface
 * for serverless HTTP responses.
 *
 * The returned iterator provides:
 * - `next()` method that reads chunks from the stream
 * - `return()` method that releases the stream reader lock
 * - Symbol.asyncIterator for async iteration support
 *
 * @param readable - The ReadableStream from a Response body, or null/undefined
 * @returns An AsyncIterableIterator<Uint8Array> or null if no readable stream provided
 */
export function streamToAsyncIterator(readable: Response['body']): AsyncIterableIterator<Uint8Array> | null {
  if (readable == null) return null;
  const reader = readable.getReader();
  return {
    next() {
      return reader.read();
    },
    return() {
      reader.releaseLock();
      return Promise.resolve({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  } as AsyncIterableIterator<Uint8Array>;
}
