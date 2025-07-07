# Storage Types

The Storage module provides a comprehensive set of TypeScript types for storage operations and configurations. These types ensure type safety and provide a consistent interface for working with storage implementations.

## Core Types

### BaseOptions

Base interface for storage options that includes an optional storage name.

```typescript
export interface BaseOptions {
  storage?: string;
}
```

### Mount

Interface for mounting a new storage instance. The `initOptions` type is inferred by the adapter, making it conditionally optional or required.

```typescript
export type Mount<T extends Storage<any>> = {
  name?: string;
  storage: IOC.Newable<Storage<any>>;
} & (T extends Storage<undefined>
  ? { initOptions?: unknown }
  : T extends Storage<infer U>
  ? { initOptions: U }
  : never);
```

### Storages

Interface for a mounted storage instance.

```typescript
export interface Storages<T = unknown> {
  storage: Storage;
  initOptions?: T;
}
```

## Operation Types

### GetItem

Interface for retrieving an item from storage.

```typescript
export interface GetItem extends BaseOptions {
  key: string;
}
```

### SetItem

Interface for storing an item in storage.

```typescript
export interface SetItem<T = unknown, U = unknown> extends BaseOptions {
  key: string;
  value: T;
  options?: U;
}
```

### DeleteItem

Interface for deleting an item from storage.

```typescript
export interface DeleteItem extends BaseOptions {
  key: string;
}
```

### HasItem

Interface for checking if an item exists in storage.

```typescript
export interface HasItem extends BaseOptions {
  key: string;
}
```

### GetKeys

Interface for retrieving all keys from storage.

```typescript
export interface GetKeys extends BaseOptions {
}
```

### Clear

Interface for clearing all items from storage.

```typescript
export interface Clear extends BaseOptions {
}
```

### Size

Interface for getting the number of items in storage.

```typescript
export interface Size extends BaseOptions {
}
```

## Usage Examples

### Using Types with StorageManager

```typescript
import { StorageManager, StorageTypes } from '@vercube/storage';

class UserService {
  @Inject(StorageManager)
  private storageManager: StorageManager;
  
  async getUserData(userId: string): Promise<UserData | null> {
    // Using GetItem type
    const params: StorageTypes.GetItem = {
      storage: 'users',
      key: `user:${userId}`
    };
    
    return this.storageManager.getItem<UserData>(params);
  }
  
  async saveUserData(userId: string, data: UserData): Promise<void> {
    // Using SetItem type
    const params: StorageTypes.SetItem<UserData> = {
      storage: 'users',
      key: `user:${userId}`,
      value: data
    };
    
    await this.storageManager.setItem(params);
  }
}
```

### Creating Custom Storage Options

```typescript
import { Storage, StorageTypes } from '@vercube/storage';

interface RedisStorageOptions {
  host: string;
  port: number;
  password?: string;
}

class RedisStorage extends Storage {
  private options: RedisStorageOptions;
  
  public initialize(options: RedisStorageOptions): void {
    this.options = options;
    // Initialize Redis connection
  }
  
  // Implement other Storage methods
}
```

## Best Practices

1. **Type Safety**
   - Always use the provided types for storage operations
   - Extend base types for custom storage implementations
   - Use generic types for stored values

2. **Type Definitions**
   - Keep type definitions simple and focused
   - Document complex type constraints
   - Use TypeScript's type system effectively

3. **Error Handling**
   - Define error types for storage operations
   - Use type guards for runtime type checking
   - Handle type-related errors gracefully

## See Also

- [Storage Manager](./storage-manager.md) - Documentation of the StorageManager class
- [Storage Interface](./storage-interface.md) - Documentation of the Storage abstract class
- [Storage Implementations](./storage-implementations.md) - Available storage implementations 