# Storage Implementations

Vercube provides several built-in storage implementations that can be used with the Storage module. Each implementation is designed for specific use cases and performance requirements.

## Available Implementations

### MemoryStorage

The `MemoryStorage` class provides a simple in-memory storage implementation that persists data only for the duration of the application runtime.

```typescript
import { Storage } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage';

// MemoryStorage implements the Storage interface
class MemoryStorage implements Storage {
  private storage: Map<string, unknown> = new Map();
  
  // Implementation of Storage methods
  public initialize(): void {
    // No initialization needed
  }
  
  public getItem<T = unknown>(key: string): T {
    return this.storage.get(key) as T;
  }
  
  public setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): void {
    this.storage.set(key, value);
  }
  
  // Other methods...
}
```

#### Usage

```typescript
import { Container } from '@vercube/di';
import { StorageManager, MemoryStorage } from '@vercube/storage';

export function useContainer(container: Container): Container {
  // Bind the StorageManager to the container
  container.bind(StorageManager);
  
  // Get the StorageManager instance
  const storageManager = container.get(StorageManager);
  
  // Mount a memory storage instance
  storageManager.mount({
    name: 'cache',
    storage: MemoryStorage
  });
  
  return container;
}
```

#### Use Cases

- Caching temporary data
- Testing and development
- In-memory data storage
- Performance-critical operations

## Creating Custom Implementations

You can create custom storage implementations by extending the `Storage` abstract class. Here are some examples:

### RedisStorage

```typescript
import { Storage } from '@vercube/storage';
import Redis from 'ioredis';

interface RedisStorageOptions {
  host: string;
  port: number;
  password?: string;
}

class RedisStorage extends Storage {
  private client: Redis;
  private options: RedisStorageOptions;
  
  public initialize(options: RedisStorageOptions): void {
    this.options = options;
    this.client = new Redis(options);
  }
  
  public async getItem<T = unknown>(key: string): Promise<T> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) as T : null;
  }
  
  public async setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }
  
  public async deleteItem(key: string): Promise<void> {
    await this.client.del(key);
  }
  
  public async hasItem(key: string): Promise<boolean> {
    return await this.client.exists(key) > 0;
  }
  
  public async getKeys(): Promise<string[]> {
    return await this.client.keys('*');
  }
  
  public async clear(): Promise<void> {
    await this.client.flushall();
  }
  
  public async size(): Promise<number> {
    return await this.client.dbsize();
  }
}
```

### FileStorage

```typescript
import { Storage } from '@vercube/storage';
import fs from 'fs/promises';
import path from 'path';

interface FileStorageOptions {
  directory: string;
}

class FileStorage extends Storage {
  private directory: string;
  
  public initialize(options: FileStorageOptions): void {
    this.directory = options.directory;
    // Ensure directory exists
    fs.mkdir(this.directory, { recursive: true });
  }
  
  public async getItem<T = unknown>(key: string): Promise<T> {
    const filePath = path.join(this.directory, key);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data) as T;
    } catch (error) {
      return null;
    }
  }
  
  public async setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): Promise<void> {
    const filePath = path.join(this.directory, key);
    await fs.writeFile(filePath, JSON.stringify(value));
  }
  
  // Other methods...
}
```

### S3Storage

The `S3Storage` class provides key-value operations backed by AWS S3.

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Storage } from '@vercube/storage';
import { S3Storage } from '@vercube/storage';

// S3Storage implements the Storage interface
class S3Storage implements Storage<StorageTypes.S3BaseOptions> {
  private s3: S3Client;
  private bucket: string;
  
  // Implementation of Storage methods
  public async initialize(options: StorageTypes.S3BaseOptions): Promise<void> {
    this.s3 = new S3Client({ ...options });
    this.bucket = options.bucket;
  }

  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  
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
    } catch (error_: any) {
      if (error_.name === 'NoSuchKey') {
        return undefined as T;
      }
      throw error_;
    }
  }
  
  // Other methods...
}
```

#### Usage

```typescript
import { Container } from '@vercube/di';
import { StorageManager, S3Storage } from '@vercube/storage';

export function useContainer(container: Container): Container {
  // Bind the StorageManager to the container
  container.bind(StorageManager);
  
  // Get the StorageManager instance
  const storageManager = container.get(StorageManager);
  
  // Mount a S3 storage instance
  storageManager.mount({
    name: 's3',
    storage: S3Storage,
    initOptions: {
      region: 'us-east-1',
      bucket: 'test-bucket',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
      }
    }
  });
  
  return container;
}
```

## Best Practices

1. **Implementation Selection**
   - Choose the right storage implementation for your use case
   - Consider performance, persistence, and scalability requirements
   - Evaluate memory usage and resource constraints

2. **Custom Implementations**
   - Follow the Storage interface contract
   - Handle errors and edge cases
   - Implement proper cleanup and resource management
   - Document implementation-specific features and limitations

3. **Performance Optimization**
   - Use appropriate data structures
   - Implement caching where beneficial
   - Consider batch operations for better performance

4. **Testing**
   - Write unit tests for custom implementations
   - Test edge cases and error conditions
   - Benchmark performance for critical operations

## See Also

- [Storage Manager](./storage-manager.md) - Documentation of the StorageManager class
- [Storage Interface](./storage-interface.md) - Documentation of the Storage abstract class
- [Storage Types](./storage-types.md) - Type definitions for storage operations 