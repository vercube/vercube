# Advanced Topics

This document covers advanced usage patterns and techniques for Vercube's dependency injection system. These topics are useful for complex applications and specific use cases.

## Implementation Details

### No Reflection Usage

Vercube's dependency injection system is designed to work without using reflection. Instead, it uses a combination of:

1. **Decorator Metadata**: The `@Inject` and other decorators store dependency information directly on the class prototype
2. **Container Registry**: The container maintains a registry of services and their implementations
3. **Explicit Resolution**: Dependencies are resolved explicitly when services are instantiated

This approach offers several advantages:
- Better performance (no reflection overhead)
- Works in environments where reflection is limited or disabled
- More predictable behavior
- Easier to debug

### How It Works

When you use the `@Inject` decorator, it registers the dependency information directly on the class:

```typescript
class UserService {
  @Inject(Logger)
  private logger!: Logger;
}
```

The decorator adds metadata to the class that the container can access without reflection:

```typescript
// Simplified internal implementation
function Inject(key: ServiceKey) {
  return function(target: any, propertyKey: string) {
    // Store dependency information directly on the class
    if (!target.constructor.__dependencies) {
      target.constructor.__dependencies = [];
    }
    target.constructor.__dependencies.push({
      key,
      propertyKey,
      optional: false
    });
  };
}
```

When resolving a service, the container uses this metadata to inject dependencies:

```typescript
// Simplified internal implementation
resolve<T>(target: Constructor<T>): T {
  const instance = new target();
  const dependencies = target.__dependencies || [];
  
  for (const dep of dependencies) {
    const service = this.get(dep.key);
    instance[dep.propertyKey] = service;
  }
  
  return instance;
}
```

## Service Lifecycle Hooks

You can implement lifecycle hooks to manage service resources:

```typescript
class DatabaseService {
  private connection?: Connection;

  @Init()
  async initialize() {
    this.connection = await this.connect();
  }

  @Destroy()
  async cleanup() {
    if (this.connection) {
      await this.connection.close();
    }
  }
}
```

## Dynamic Service Registration

You can register services dynamically based on configuration:

```typescript
function registerServices(container: Container, config: Config) {
  // Register logger based on environment
  if (config.env === 'production') {
    container.bind(Logger, ProductionLogger);
  } else {
    container.bind(Logger, ConsoleLogger);
  }

  // Register database based on type
  switch (config.dbType) {
    case 'mysql':
      container.bind(Database, MySQLDatabase);
      break;
    case 'postgres':
      container.bind(Database, PostgresDatabase);
      break;
    default:
      container.bind(Database, SQLiteDatabase);
  }
}
```

## Conditional Injection

You can use conditional injection based on runtime conditions:

```typescript
class NotificationService {
  @InjectOptional(EmailService)
  private emailService?: EmailService;

  @InjectOptional(SMSService)
  private smsService?: SMSService;

  async notify(user: User, message: string) {
    if (user.preferences.email && this.emailService) {
      await this.emailService.send(user.email, message);
    }
    if (user.preferences.sms && this.smsService) {
      await this.smsService.send(user.phone, message);
    }
  }
}
```

## Service Composition

You can compose services to create more complex functionality:

```typescript
class CompositeLogger implements ILogger {
    @Inject(FileLogger)
    private fileLogger: FileLogger;

    @Inject(ConsoleLogger)
    private consoleLogger: ConsoleLogger;

  info(message: string): void {
    this.fileLogger.info(message);
    this.consoleLogger.info(message);
  }

  error(message: string): void {
    this.fileLogger.error(message);
    this.consoleLogger.error(message);
  }
}
```

## Testing Patterns

### Mocking Services

```typescript
// Create a test container
const testContainer = new Container();

// Register mock services
testContainer.bindMock(Logger, {
  info: jest.fn(),
  error: jest.fn()
});

testContainer.bindMock(UserRepository, {
  findById: jest.fn().mockResolvedValue({ id: '123', name: 'Test User' })
});

// Resolve service with mocks
const userService = testContainer.resolve(UserService);
```

## Performance Optimization

### Lazy Loading

```typescript
class LazyService {
  @Inject(() => HeavyService)
  private heavyService!: HeavyService;
}
```

### Service Caching

```typescript
class CachedService {
  private cache = new Map<string, any>();

  @Inject(ExpensiveService)
  private expensiveService!: ExpensiveService;

  async getData(key: string) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const data = await this.expensiveService.fetch(key);
    this.cache.set(key, data);
    return data;
  }
}
```

## Best Practices

1. **Use Child Containers for Modularity**
   - Separate concerns
   - Better resource management
   - Easier testing

2. **Implement Lifecycle Hooks**
   - Proper resource cleanup
   - Better error handling
   - Improved reliability

3. **Use Interceptors for Cross-Cutting Concerns**
   - Logging
   - Performance monitoring
   - Error handling

4. **Optimize Service Resolution**
   - Use lazy loading
   - Implement caching
   - Minimize dependencies

5. **Write Testable Code**
   - Use interfaces
   - Implement dependency injection
   - Create mock services

## See Also

- [Container](./container.md) - The core container class and its methods
- [Decorators](./decorators.md) - Available decorators for dependency injection
- [Types](./types.md) - Type definitions used in the DI system 