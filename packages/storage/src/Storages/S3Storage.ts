/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { Storage } from '../Service/Storage';
import { Readable } from 'node:stream';

type InitializeOptions = Partial<S3Client> & {
  region: string;
  bucket: string;
}

/**
 * S3 storage implementation of the Storage interface
 * 
 * @implements {Storage}
 */
export class S3Storage implements Storage {
  private s3: S3Client;
  private bucket: string;

  /**
   * Initializes the S3 storage
   */
  public async initialize(options: InitializeOptions): Promise<void> {
    this.s3 = new S3Client({ ...options });
    this.bucket = options.bucket;
  }

  /**
   * Retrieves a value from S3 storage by its key
   * @template T - Type of the stored value
   * @param {string} key - The key to retrieve the value for
   * @returns {T} The stored value cast to type T
   */
  public async getItem<T = unknown>(key: string): Promise<T> {
    try {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      if (!result.Body) return undefined as T;

      const body = await this.streamToString(result.Body as Readable);
      return JSON.parse(body) as T;
    } catch (error_: any) {
      if (error_.name === 'NoSuchKey') {
        return undefined as T;
      }
      throw error_;
    }
  }

  /**
   * Stores a value in S3 storage with the specified key
   * @template T - Type of the value to store
   * @template U - Type of the options object
   * @param {string} key - The key under which to store the value
   * @param {T} value - The value to store
   */
  public async setItem<T = unknown, U = unknown>(
    key: string,
    value: T,
    options?: U,
  ): Promise<void> {
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
   * Removes a value from S3 storage by its key
   * @param {string} key - The key of the value to delete
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
   * Checks if a value exists in S3 storage for the given key
   * @param {string} key - The key to check
   * @returns {boolean} True if the key exists, false otherwise
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
    } catch (error_: any) {
      if (error_.name === 'NoSuchKey') {
        return false;
      }
      throw error_;
    }
  }

  /**
   * Retrieves all keys currently stored in S3 storage
   * @returns {string[]} Array of all stored keys
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
   * Removes all stored values from S3 storage
   */
  public async clear(): Promise<void> {
    const keys = await this.getKeys();
    for (const key of keys) {
      await this.deleteItem(key);
    }
  }

  /**
   * Gets the number of key-value pairs stored in S3 storage
   * @returns {number} The number of stored items
   */
  public async size(): Promise<number> {
    const keys = await this.getKeys();
    return keys.length;
  }

  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}