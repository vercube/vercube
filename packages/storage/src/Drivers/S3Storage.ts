import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Storage } from '../Service/Storage';
import type { ListObjectsV2CommandOutput, S3ClientConfig } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Configuration options for S3 storage.
 * Extends AWS S3ClientConfig with required bucket name.
 *
 * @property {string} bucket - The S3 bucket name (required)
 * @property {string} region - AWS region (e.g., 'us-east-1') (required)
 * @property {object} credentials - AWS credentials (optional)
 *
 * @remarks
 * **Authentication Methods:**
 *
 * 1. **IAM Roles (Recommended for AWS environments):**
 *    Omit the credentials field to use IAM roles automatically.
 *    This is the most secure method for Lambda, EC2, ECS, etc.
 *    ```ts
 *    { bucket: 'my-bucket', region: 'us-east-1' }
 *    ```
 *
 * 2. **Explicit Credentials:**
 *    Provide credentials explicitly (use with AWS Secrets Manager for security).
 *    ```ts
 *    {
 *      bucket: 'my-bucket',
 *      region: 'us-east-1',
 *      credentials: {
 *        accessKeyId: 'YOUR_ACCESS_KEY',
 *        secretAccessKey: 'YOUR_SECRET_KEY'
 *      }
 *    }
 *    ```
 *
 * 3. **STS Temporary Credentials:**
 *    Use temporary credentials from AWS STS AssumeRole.
 *    ```ts
 *    {
 *      bucket: 'my-bucket',
 *      region: 'us-east-1',
 *      credentials: {
 *        accessKeyId: tempCreds.AccessKeyId,
 *        secretAccessKey: tempCreds.SecretAccessKey,
 *        sessionToken: tempCreds.SessionToken
 *      }
 *    }
 *    ```
 *
 * When credentials are not provided, AWS SDK uses the default credential provider chain:
 * - IAM roles (Lambda execution role, EC2 instance profile, ECS task role)
 * - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * - Shared credentials file (~/.aws/credentials)
 * - ECS container credentials
 * - EC2 instance metadata service
 */
export interface S3BaseOptions extends S3ClientConfig {
  bucket: string;
}

/**
 * S3 storage implementation of the Storage interface.
 * Provides key-value operations backed by AWS S3.
 *
 * @remarks
 * **Security Best Practices:**
 * - Use IAM roles in AWS environments (Lambda, EC2, ECS) instead of explicit credentials
 * - Store credentials in AWS Secrets Manager if explicit credentials are required
 * - Never hardcode credentials in source code
 * - Use environment-specific configurations (IAM roles for production, credentials for local dev)
 * - Grant minimum required S3 permissions (principle of least privilege)
 *
 * @example
 * ```ts
 * // Recommended: Using IAM roles (no credentials)
 * const storage = new S3Storage();
 * await storage.initialize({
 *   bucket: 'my-app-bucket',
 *   region: 'us-east-1'
 * });
 *
 * // Alternative: Using explicit credentials from environment
 * await storage.initialize({
 *   bucket: 'my-app-bucket',
 *   region: 'us-east-1',
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
 *   }
 * });
 * ```
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
   *
   * @remarks
   * The AWS SDK automatically handles credential resolution when credentials are not explicitly provided.
   * In AWS environments (Lambda, EC2, ECS), IAM roles are used automatically, providing enhanced security
   * without manual credential management.
   *
   * Priority of credential sources (when credentials field is omitted):
   * 1. IAM roles (Lambda execution role, EC2 instance profile, ECS task role)
   * 2. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
   * 3. Shared credentials file (~/.aws/credentials)
   * 4. ECS container credentials
   * 5. EC2 instance metadata service
   *
   * When credentials are explicitly provided in options, they take precedence over all other sources.
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
