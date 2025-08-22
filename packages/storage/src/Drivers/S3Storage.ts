import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Storage } from '../Service/Storage';
import type { ListObjectsV2CommandOutput, S3ClientConfig } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

/* eslint-disable @typescript-eslint/no-unused-vars */

export interface S3BaseOptions extends S3ClientConfig {
  bucket: string;
}

/**
 * S3 storage implementation of the Storage interface.
 * Provides key-value operations backed by AWS S3.
 *
 * @implements {Storage}
 */
export class S3Storage implements Storage<S3BaseOptions> {
  private s3: S3Client;
  private bucket: string;

  /**
   * Initializes the S3 storage client.
   *
   * @param {S3BaseOptions} options - Configuration options for the S3 client.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public async initialize(options: S3BaseOptions): Promise<void> {
    this.s3 = new S3Client({ ...options });
    this.bucket = options.bucket;
  }

  /**
   * Retrieves and parses a value from S3 storage by its key.
   *
   * @template T
   * @param {string} key - The key whose value should be retrieved.
   * @returns {Promise<T | undefined>} The stored value parsed as type T, or undefined if the key does not exist.
   * @throws Will rethrow any S3 error except for missing key (`NoSuchKey`).
   */
  public async getItem<T = unknown>(key: string): Promise<T> {
    try {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      if (!result.Body) {
        return undefined as T;
      }

      const body = await this.streamToString(result.Body as Readable);
      return JSON.parse(body) as T;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return undefined as T;
      }
      throw error;
    }
  }

  /**
   * Stores a value in S3 storage under the specified key.
   *
   * @template T
   * @template U
   * @param {string} key - The key under which to store the value.
   * @param {T} value - The value to store (will be JSON serialized).
   * @param {U} [options] - Additional options (currently unused).
   * @returns {Promise<void>} A promise that resolves when the value has been stored.
   */
  public async setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: 'application/json',
      }),
    );
  }

  /**
   * Removes an item from S3 storage by its key.
   *
   * @param {string} key - The key of the item to delete.
   * @returns {Promise<void>} A promise that resolves when the item has been deleted.
   */
  public async deleteItem(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  /**
   * Checks if a key exists in S3 storage.
   *
   * @param {string} key - The key to check.
   * @returns {Promise<boolean>} True if the key exists, false otherwise.
   * @throws Will rethrow any S3 error except for missing key (`NoSuchKey`).
   */
  public async hasItem(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Retrieves a list of all keys stored in the S3 bucket.
   *
   * @returns {Promise<string[]>} An array of all stored keys.
   */
  public async getKeys(): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined = undefined;

    do {
      const result: ListObjectsV2CommandOutput = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
        }),
      );

      if (result.Contents) {
        for (const obj of result.Contents) {
          if (obj.Key) keys.push(obj.Key);
        }
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  /**
   * Deletes all items from S3 storage.
   *
   * @returns {Promise<void>} A promise that resolves when all items have been deleted.
   */
  public async clear(): Promise<void> {
    const keys = await this.getKeys();
    for (const key of keys) {
      await this.deleteItem(key);
    }
  }

  /**
   * Gets the total number of stored items.
   *
   * @returns {Promise<number>} The count of stored items.
   */
  public async size(): Promise<number> {
    const keys = await this.getKeys();
    return keys.length;
  }

  /**
   * Converts a Node.js readable stream into a UTF-8 string.
   *
   * @private
   * @param {Readable} stream - The readable stream to convert.
   * @returns {Promise<string>} The stream contents as a string.
   */
  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
