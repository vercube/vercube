# Container

The `Container` class is the core of Vercube's dependency injection system. It manages the registration and resolution of dependencies, handling their lifecycle and ensuring proper instantiation.

## Class Definition

```typescript
class Container {
  constructor(options?: ContainerOptions);
  
  // Registration methods
  bind<T>(key: ServiceKey<T>, value?: ServiceValue<T>): void;
  bindTransient<T>(key: ServiceKey<T>, value?: ServiceValue<T>): void;
  bindInstance<T>(key: ServiceKey<T>, instance: T): void;
  bindMock<T>(key: ServiceKey<T>, mock: T): void;
  
  // Resolution methods
  get<T>(key: ServiceKey<T>): T;
  getOptional<T>(key: ServiceKey<T>): T | undefined;
  resolve<T>(target: Constructor<T>): T;
  
  // Utility methods
  has(key: ServiceKey): boolean;
  clear(): void;
}
```

## Constructor

### `constructor(options?: ContainerOptions)`

Creates a new container instance with optional configuration.

```typescript
interface ContainerOptions {
  autoBindInjectable?: boolean;  // Automatically bind classes with @Injectable decorator
  strictMode?: boolean;          // Enable strict mode for dependency resolution
}

const container = new Container({
  autoBindInjectable: true,
  strictMode: false
});
```

## Registration Methods

### `bind<T>(key: ServiceKey<T>, value?: ServiceValue<T>): void`

Registers a service as a singleton. If no value is provided, the key itself is used as the implementation.

```typescript
// Register a class
container.bind(Logger, ConsoleLogger);

// Register an interface with implementation
container.bind(ILogger, ConsoleLogger);

// Register a class as its own implementation
container.bind(UserService);
```

### `bindTransient<T>(key: ServiceKey<T>, value?: ServiceValue<T>): void`

Registers a service as transient, creating a new instance each time it's resolved.

```typescript
// Register a transient service
container.bindTransient(Logger, ConsoleLogger);

// Register a class as transient
container.bindTransient(UserService);
```

### `bindInstance<T>(key: ServiceKey<T>, instance: T): void`

Registers an existing instance as a singleton.

```typescript
const logger = new ConsoleLogger();
container.bindInstance(Logger, logger);
```

### `bindMock<T>(key: ServiceKey<T>, mock: T): void`

Registers a mock implementation, useful for testing.

```typescript
const mockLogger = {
  info: jest.fn(),
  error: jest.fn()
};
container.bindMock(Logger, mockLogger);
```

## Service Overriding

Services can be overridden by registering a new implementation for the same key. This is useful for:

- Replacing implementations in different environments
- Swapping implementations for testing
- Upgrading services without changing dependent code

### Overriding a Service

```typescript
// Register the default implementation
container.bind(Logger, ConsoleLogger);

// Later, override with a different implementation
container.bind(Logger, FileLogger);
```

### Overriding in Child Containers

Child containers can override services from their parent container:

```typescript
// Parent container
const parentContainer = new Container();
parentContainer.bind(Logger, ConsoleLogger);

// Child container overrides the Logger
const childContainer = new Container(parentContainer);
childContainer.bind(Logger, FileLogger);

// This will use FileLogger
const logger = childContainer.get(Logger);
```

### Conditional Overriding

You can conditionally override services based on configuration:

```typescript
function setupContainer(container: Container, config: Config) {
  // Register base services
  container.bind(UserService);
  container.bind(ProductService);
  
  // Override based on environment
  if (config.env === 'production') {
    container.bind(Logger, ProductionLogger);
    container.bind(Database, ProductionDatabase);
  } else if (config.env === 'testing') {
    container.bind(Logger, TestLogger);
    container.bind(Database, InMemoryDatabase);
  } else {
    container.bind(Logger, ConsoleLogger);
    container.bind(Database, SQLiteDatabase);
  }
}
```

### Overriding for Testing

Service overriding is particularly useful for testing:

```typescript
describe('UserService', () => {
  let container: Container;
  let userService: UserService;
  
  beforeEach(() => {
    container = new Container();
    
    // Register real implementations
    container.bind(Logger, ConsoleLogger);
    container.bind(Database, SQLiteDatabase);
    
    // Override with mocks for testing
    container.bindMock(UserRepository, {
      findById: jest.fn().mockResolvedValue({ id: '123', name: 'Test User' })
    });
    
    userService = container.resolve(UserService);
  });
  
  it('should find user by id', async () => {
    const user = await userService.getUser('123');
    expect(user).toBeDefined();
  });
});
```

## Resolution Methods

### `get<T>(key: ServiceKey<T>): T`

Resolves a service instance. Throws an error if the service is not registered.

```typescript
const logger = container.get(Logger);
logger.info('Hello, world!');
```

### `getOptional<T>(key: ServiceKey<T>): T | undefined`

Resolves a service instance. Returns undefined if the service is not registered.

```typescript
const logger = container.getOptional(Logger);
if (logger) {
  logger.info('Logger is available');
}
```

### `resolve<T>(target: Constructor<T>): T`

Creates a new instance of a class, automatically resolving its dependencies.

```typescript
class UserController {
  constructor(
    @Inject(UserService) private userService: UserService,
    @Inject(Logger) private logger: Logger
  ) {}
}

const controller = container.resolve(UserController);
```

## Utility Methods

### `has(key: ServiceKey): boolean`

Checks if a service is registered in the container.

```typescript
if (container.has(Logger)) {
  console.log('Logger is registered');
}
```

### `clear(): void`

Clears all registered services from the container.

```typescript
container.clear();
```

## Examples

### Basic Usage

```typescript
// Create a container
const container = new Container();

// Register services
container.bind(Logger, ConsoleLogger);
container.bind(UserService);
container.bind(UserController);

// Resolve and use a service
const controller = container.resolve(UserController);
await controller.getUser('123');
```

### Testing Setup

```typescript
// Create a container for testing
const container = new Container();

// Register mock services
container.bindMock(Logger, {
  info: jest.fn(),
  error: jest.fn()
});

container.bindMock(UserService, {
  getUser: jest.fn().mockResolvedValue({ id: '123', name: 'Test User' })
});

// Resolve the controller with mock dependencies
const controller = container.resolve(UserController);
```

### Scoped Services

```typescript
// Register a singleton service
container.bind(ConfigService);

// Register a transient service
container.bindTransient(Logger, ConsoleLogger);

// Register an instance
const db = new Database();
container.bindInstance(Database, db);

// Use the services
class App {
  constructor(
    @Inject(ConfigService) private config: ConfigService,
    @Inject(Logger) private logger: Logger,
    @Inject(Database) private db: Database
  ) {}
}
```

## Best Practices

1. **Register Services Early**
   - Register all services during application bootstrap
   - Use a dedicated configuration file for service registration

2. **Use Appropriate Scopes**
   - Use singletons for stateless services
   - Use transient for services that need fresh instances
   - Use instances for external resources

3. **Handle Errors Gracefully**
   - Use `getOptional` when a service might not be available
   - Provide fallback implementations when needed

4. **Clean Up Resources**
   - Use `clear()` when shutting down the application
   - Implement proper cleanup in services

5. **Use Service Overriding Strategically**
   - Override services for different environments
   - Use overriding for testing
   - Document when services are overridden

## See Also

- [Decorators](./decorators.md) - Available decorators for dependency injection
- [Types](./types.md) - Type definitions used in the DI system
- [Advanced Topics](./advanced.md) - Advanced usage patterns and techniques