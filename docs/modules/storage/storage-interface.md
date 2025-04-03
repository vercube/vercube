# Storage Interface

The `Storage` abstract class defines the standard interface for storage implementations in Vercube. It provides a consistent API for storing and retrieving data across different storage backends.

## Interface

```typescript
abstract class Storage {
  // Initialize the storage implementation
  public abstract initialize(options?: unknown): void | Promise<void>;
  
  // Core storage operations
  public abstract getItem<T = unknown>(key: string): T | Promise<T>;
  public abstract setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): void | Promise<void>;
  public abstract deleteItem(key: string): void | Promise<void>;
  public abstract hasItem(key: string): boolean | Promise<boolean>;
  public abstract getKeys(): string[] | Promise<string[]>;
  public abstract clear(): void | Promise<void>;
  public abstract size(): number | Promise<number>;
}
```

## Method Descriptions

### initialize

Initializes the storage implementation with optional configuration.

```typescript
public abstract initialize(options?: unknown): void | Promise<void>;
```

### getItem

Retrieves a value from storage by its key.

```typescript
public abstract getItem<T = unknown>(key: string): T | Promise<T>;
```

### setItem

Stores a value in storage with the specified key and optional options.

```typescript
public abstract setItem<T = unknown, U = unknown>(key: string, value: T, options?: U): void | Promise<void>;
```

### deleteItem

Removes a value from storage by its key.

```typescript
public abstract deleteItem(key: string): void | Promise<void>;
```

### hasItem

Checks if a value exists in storage for the given key.

```typescript
public abstract hasItem(key: string): boolean | Promise<boolean>;
```

### getKeys

Retrieves all keys currently stored in storage.

```typescript
public abstract getKeys(): string[] | Promise<string[]>;
```

### clear

Removes all stored values from storage.

```typescript
public abstract clear(): void | Promise<void>;
```

### size

Gets the number of key-value pairs stored in storage.

```typescript
public abstract size(): number | Promise<number>;
```

## Best Practices

1. **Initialization**
   - Perform any necessary setup in the `initialize` method
   - Validate configuration options
   - Handle initialization errors gracefully

2. **Type Safety**
   - Use generic types for stored values
   - Implement proper type checking
   - Document type constraints

3. **Error Handling**
   - Throw appropriate errors for invalid operations
   - Handle edge cases (e.g., storage full, network errors)
   - Provide meaningful error messages

4. **Performance**
   - Optimize for your specific use case
   - Consider caching strategies
   - Implement efficient data structures

## See Also

- [Storage Manager](./storage-manager.md) - Documentation of the StorageManager class
- [Storage Types](./storage-types.md) - Type definitions for storage operations
- [Storage Implementations](./storage-implementations.md) - Available storage implementations 