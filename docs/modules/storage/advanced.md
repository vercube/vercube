# Advanced Storage Usage

This guide covers advanced patterns and techniques for using the Storage module in Vercube applications.

## Multiple Storage Instances

The StorageManager supports multiple storage instances, each with its own implementation and configuration.

```typescript
import { Container } from '@vercube/di';
import { StorageManager, MemoryStorage } from '@vercube/storage';

export function useContainer(container: Container): Container {
  // Bind the StorageManager to the container
  container.bind(StorageManager);
  
  // Get the StorageManager instance
  const storageManager = container.get(StorageManager);
  
  // Mount multiple storage instances
  storageManager.mount({
    name: 'cache',
    storage: MemoryStorage
  });
  
  storageManager.mount({
    name: 'session',
    storage: MemoryStorage,
    initOptions: {
      // Session-specific options
    }
  });
  
  return container;
}
```

### Implementing a Cached Storage

```typescript
import { Storage } from '@vercube/storage';

class CachedStorage extends Storage {
  private cache: Map<string, unknown> = new Map();
  private storage: Storage;
  
  constructor(storage: Storage) {
    super();
    this.storage = storage;
  }
  
  public async initialize(options?: unknown): Promise<void> {
    await this.storage.initialize(options);
  }
  
  public async getItem<T = unknown>(key: string): Promise<T> {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    
    // Get from storage and cache
    const value = await this.storage.getItem<T>(key);
    if (value !== null) {
      this.cache.set(key, value);
    }
    
    return value;
  }
  
  public async setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): Promise<void> {
    // Update both cache and storage
    this.cache.set(key, value);
    await this.storage.setItem(key, value, options);
  }
  
  // Implement other methods...
}
```


### Batch Operations

```typescript
class BatchStorage extends Storage {
  private storage: Storage;
  private batch: Map<string, unknown> = new Map();
  private batchSize: number;
  
  constructor(storage: Storage, batchSize: number = 100) {
    super();
    this.storage = storage;
    this.batchSize = batchSize;
  }
  
  public async setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): Promise<void> {
    this.batch.set(key, value);
    
    if (this.batch.size >= this.batchSize) {
      await this.flush();
    }
  }
  
  public async flush(): Promise<void> {
    if (this.batch.size === 0) return;
    
    // Implement batch write logic
    for (const [key, value] of this.batch.entries()) {
      await this.storage.setItem(key, value);
    }
    
    this.batch.clear();
  }
  
  // Implement other methods...
}
```

## Testing

### Mock Storage for Testing

```typescript
class MockStorage extends Storage {
  private data: Map<string, unknown> = new Map();
  private calls: Map<string, any[]> = new Map();
  
  public initialize(): void {
    // No initialization needed
  }
  
  public getItem<T = unknown>(key: string): T {
    this.recordCall('getItem', [key]);
    return this.data.get(key) as T;
  }
  
  public setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): void {
    this.recordCall('setItem', [key, value, options]);
    this.data.set(key, value);
  }
  
  private recordCall(method: string, args: any[]): void {
    if (!this.calls.has(method)) {
      this.calls.set(method, []);
    }
    this.calls.get(method).push(args);
  }
  
  public getCalls(method: string): any[] {
    return this.calls.get(method) || [];
  }
  
  // Implement other methods...
}
```

### Using Mock Storage in Tests

```typescript
describe('UserService', () => {
  let userService: UserService;
  let mockStorage: MockStorage;
  
  beforeEach(() => {
    mockStorage = new MockStorage();
    userService = new UserService(mockStorage);
  });
  
  it('should save user data', async () => {
    const userData = { id: 1, name: 'John' };
    await userService.saveUser(userData);
    
    const calls = mockStorage.getCalls('setItem');
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('user:1');
    expect(calls[0][1]).toEqual(userData);
  });
});
```

## See Also

- [Storage Manager](./storage-manager.md) - Documentation of the StorageManager class
- [Storage Interface](./storage-interface.md) - Documentation of the Storage abstract class
- [Storage Types](./storage-types.md) - Type definitions for storage operations
- [Storage Implementations](./storage-implementations.md) - Available storage implementations 