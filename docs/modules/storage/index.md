# Storage Module

The Storage module provides a flexible and extensible storage system for Vercube applications. It offers a unified interface for different storage implementations through a dependency injection-based architecture.

## Overview

The Storage module consists of:

- **StorageManager**: A central service that manages multiple storage instances
- **Storage**: An abstract base class that defines the interface for storage implementations
- **Storage Types**: Type definitions for storage operations and configurations
- **Storage Implementations**: Concrete implementations of the Storage interface (e.g., MemoryStorage)

## Key Features

- **Multiple Storage Support**: Mount and manage multiple storage instances with different implementations
- **Dependency Injection**: Seamlessly integrates with Vercube's DI system
- **Type Safety**: Full TypeScript support with generic types for stored values
- **Extensible**: Create custom storage implementations by extending the Storage abstract class
- **Async Support**: All operations support both synchronous and asynchronous execution

## Basic Usage

```typescript
import { Container } from '@vercube/di';
import { StorageManager, MemoryStorage } from '@vercube/storage';

// Configure the container
export function useContainer(container: Container): Container {
  // Bind the StorageManager to the container
  container.bind(StorageManager);
  
  // Mount a memory storage instance
  const storageManager = container.get(StorageManager);
  storageManager.mount({
    name: 'cache',
    storage: MemoryStorage
  });
  
  return container;
}
```

## See Also

- [Storage Manager](./storage-manager.md) - Detailed documentation of the StorageManager class
- [Storage Interface](./storage-interface.md) - Documentation of the Storage abstract class
- [Storage Types](./storage-types.md) - Type definitions for storage operations
- [Storage Implementations](./storage-implementations.md) - Available storage implementations
- [Advanced Usage](./advanced.md) - Advanced patterns and custom implementations 