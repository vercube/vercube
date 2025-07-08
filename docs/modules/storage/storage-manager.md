# Storage Manager

The `StorageManager` class is the central service for managing multiple storage instances in Vercube. It provides a unified interface for storage operations and handles the lifecycle of storage implementations.

## Interface

```typescript
class StorageManager {
  // Mount a new storage instance
  public async mount<T extends Storage<unknown>>({ name, storage, initOptions }: StorageTypes.Mount<T>): Promise<void>;
  
  // Get a storage instance by name
  public getStorage(name: string = 'default'): Storage | undefined;
  
  // Storage operations
  public async getItem<T = unknown>({ storage, key }: StorageTypes.GetItem): Promise<T | null>;
  public async setItem<T = unknown, U = unknown>({ storage, key, value, options }: StorageTypes.SetItem<T, U>): Promise<void>;
  public async deleteItem({ storage, key }: StorageTypes.DeleteItem): Promise<void>;
  public async hasItem({ storage, key }: StorageTypes.HasItem): Promise<boolean>;
  public async getKeys({ storage }: StorageTypes.GetKeys): Promise<string[]>;
  public async clear({ storage }: StorageTypes.Clear): Promise<void>;
  public async size({ storage }: StorageTypes.Size): Promise<number>;
}
```

## Usage Examples

### Basic Configuration

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

### Using Storage in a Service

```typescript
import { Inject } from '@vercube/di';
import { StorageManager } from '@vercube/storage';

class UserService {
  @Inject(StorageManager)
  private storageManager: StorageManager;
  
  async getUserPreferences(userId: string) {
    // Get user preferences from the default storage
    return this.storageManager.getItem({
      key: `user:${userId}:preferences`
    });
  }
  
  async saveUserPreferences(userId: string, preferences: any) {
    // Save user preferences to the cache storage
    await this.storageManager.setItem({
      storage: 'cache',
      key: `user:${userId}:preferences`,
      value: preferences
    });
  }
}
```

## Best Practices

1. **Storage Naming**
   - Use descriptive names for storage instances
   - Follow a consistent naming convention
   - Document the purpose of each storage instance

2. **Error Handling**
   - Always check if a storage operation returned null or undefined
   - Handle potential errors in storage operations
   - Use try/catch blocks for critical storage operations

3. **Type Safety**
   - Use generic types for stored values
   - Define interfaces for complex stored objects
   - Leverage TypeScript's type system for better code quality

4. **Performance Considerations**
   - Choose appropriate storage implementations for your use case
   - Consider using multiple storage instances for different data types
   - Be mindful of storage size and cleanup

## See Also

- [Storage Interface](./storage-interface.md) - Documentation of the Storage abstract class
- [Storage Types](./storage-types.md) - Type definitions for storage operations
- [Storage Implementations](./storage-implementations.md) - Available storage implementations 