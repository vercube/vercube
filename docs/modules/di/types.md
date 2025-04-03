# Types

This document describes the type definitions used in Vercube's dependency injection system. Understanding these types is crucial for working effectively with the DI system.

## Core Types

### `ServiceKey<T>`

A type that represents a service identifier. It can be a constructor function, an interface, or a string.

```typescript
type ServiceKey<T> = Constructor<T> | Interface<T> | string;
```

#### Examples

```typescript
// Using a class
class UserService {}
const userServiceKey: ServiceKey<UserService> = UserService;

// Using an interface
interface ILogger {
  info(message: string): void;
}
const loggerKey: ServiceKey<ILogger> = 'ILogger';

// Using a string
const configKey: ServiceKey<Config> = 'AppConfig';
```

### `ServiceValue<T>`

A type that represents a service implementation. It can be a constructor function, a factory function, or an instance.

```typescript
type ServiceValue<T> = Constructor<T> | Factory<T> | T;
```

#### Examples

```typescript
// Using a class
class ConsoleLogger implements ILogger {}
const loggerValue: ServiceValue<ILogger> = ConsoleLogger;

// Using a factory function
const loggerFactory: ServiceValue<ILogger> = () => new ConsoleLogger();

// Using an instance
const loggerInstance: ServiceValue<ILogger> = new ConsoleLogger();
```

### `Constructor<T>`

A type that represents a constructor function for a class.

```typescript
type Constructor<T> = new (...args: any[]) => T;
```

#### Examples

```typescript
class UserService {
  constructor(private logger: Logger) {}
}

const UserServiceConstructor: Constructor<UserService> = UserService;
```

### `Factory<T>`

A type that represents a factory function that creates a service instance.

```typescript
type Factory<T> = () => T;
```

#### Examples

```typescript
const createLogger: Factory<Logger> = () => new ConsoleLogger();
```

## Service Definition Types

### `ServiceDef<T>`

A type that represents a service definition, including its implementation and scope.

```typescript
interface ServiceDef<T> {
  key: ServiceKey<T>;
  value: ServiceValue<T>;
  scope: ServiceScope;
}
```

### `ServiceScope`

An enum that defines the scope of a service.

```typescript
enum ServiceScope {
  Singleton,
  Transient,
  Instance,
  Mock
}
```

#### Examples

```typescript
const loggerDef: ServiceDef<ILogger> = {
  key: 'ILogger',
  value: ConsoleLogger,
  scope: ServiceScope.Singleton
};
```

## Container Options

### `ContainerOptions`

An interface that defines the configuration options for a container.

```typescript
interface ContainerOptions {
  autoBindInjectable?: boolean;
  strictMode?: boolean;
}
```

#### Examples

```typescript
const options: ContainerOptions = {
  autoBindInjectable: true,
  strictMode: false
};
```

## Metadata Types

### `DependencyMetadata`

An interface that represents the metadata for a dependency.

```typescript
interface DependencyMetadata {
  key: ServiceKey<any>;
  optional: boolean;
}
```

#### Examples

```typescript
const loggerMetadata: DependencyMetadata = {
  key: 'ILogger',
  optional: false
};
```

### `ClassMetadata`

An interface that represents the metadata for a class.

```typescript
interface ClassMetadata {
  dependencies: DependencyMetadata[];
  initMethods: string[];
}
```

#### Examples

```typescript
const userServiceMetadata: ClassMetadata = {
  dependencies: [
    { key: 'ILogger', optional: false },
    { key: 'UserRepository', optional: false }
  ],
  initMethods: ['initialize']
};
```

## Utility Types

### `Interface<T>`

A type that represents an interface.

```typescript
type Interface<T> = { [P in keyof T]: T[P] };
```

#### Examples

```typescript
interface ILogger {
  info(message: string): void;
}

const LoggerInterface: Interface<ILogger> = {
  info: (message: string) => {}
};
```

### `InjectableClass<T>`

A type that represents a class that can be injected.

```typescript
type InjectableClass<T> = Constructor<T> & {
  __injectable?: boolean;
};
```

#### Examples

```typescript
@Injectable()
class UserService {}

const InjectableUserService: InjectableClass<UserService> = UserService;
```

## Type Guards

### `isConstructor(value: any): value is Constructor<any>`

A type guard that checks if a value is a constructor function.

```typescript
function isConstructor(value: any): value is Constructor<any> {
  return typeof value === 'function' && value.prototype && value.prototype.constructor === value;
}
```

### `isFactory(value: any): value is Factory<any>`

A type guard that checks if a value is a factory function.

```typescript
function isFactory(value: any): value is Factory<any> {
  return typeof value === 'function' && !isConstructor(value);
}
```

## Examples

### Service Registration with Types

```typescript
// Define interfaces
interface ILogger {
  info(message: string): void;
}

interface IUserRepository {
  findById(id: string): Promise<User>;
}

// Define implementations
class ConsoleLogger implements ILogger {
  info(message: string): void {
    console.log(message);
  }
}

class UserRepository implements IUserRepository {
  async findById(id: string): Promise<User> {
    // Implementation
  }
}

// Register services with proper typing
container.bind<ILogger>('ILogger', ConsoleLogger);
container.bind<IUserRepository>('IUserRepository', UserRepository);

// Use services with type safety
class UserService {
  constructor(
    @Inject('ILogger') private logger: ILogger,
    @Inject('IUserRepository') private userRepository: IUserRepository
  ) {}
}
```

### Type-Safe Service Resolution

```typescript
// Get a service with type checking
const logger = container.get<ILogger>('ILogger');
logger.info('Hello, world!');

// Get an optional service
const optionalLogger = container.getOptional<ILogger>('ILogger');
if (optionalLogger) {
  optionalLogger.info('Logger is available');
}

// Resolve a class with dependencies
const userService = container.resolve<UserService>(UserService);
```

## Best Practices

1. **Use Interfaces for Service Keys**
   - Better abstraction
   - Easier to swap implementations
   - More maintainable code

2. **Use Type Parameters**
   - Leverage TypeScript's type system
   - Catch errors at compile time
   - Better IDE support

3. **Use Type Guards**
   - Safe type checking
   - Runtime type safety
   - Better error handling

4. **Document Complex Types**
   - Use JSDoc comments
   - Provide examples
   - Explain type constraints

## See Also

- [Container](./container.md) - The core container class and its methods
- [Decorators](./decorators.md) - Available decorators for dependency injection
- [Advanced Topics](./advanced.md) - Advanced usage patterns and techniques 