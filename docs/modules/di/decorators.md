# Decorators

Vercube provides a set of decorators for dependency injection. These decorators help you declare dependencies and configure how they are injected into your classes.

## Available Decorators

### `@Inject`

The `@Inject` decorator is used to inject a required dependency into a class property or constructor parameter.

```typescript
class UserService {
  @Inject(Logger)
  private logger!: Logger;

  constructor(
    @Inject(UserRepository) private userRepository: UserRepository
  ) {}
}
```

#### Parameters

- `key: ServiceKey<T>` - The key of the service to inject

#### Usage Notes

- Can be used on class properties or constructor parameters
- The service must be registered in the container
- Throws an error if the service is not found

### `@InjectOptional`

The `@InjectOptional` decorator is used to inject an optional dependency. If the service is not registered, the property will be undefined.

```typescript
class UserService {
  @InjectOptional(Logger)
  private logger?: Logger;

  constructor(
    @InjectOptional(UserRepository) private userRepository?: UserRepository
  ) {}
}
```

#### Parameters

- `key: ServiceKey<T>` - The key of the service to inject

#### Usage Notes

- Can be used on class properties or constructor parameters
- The service does not need to be registered
- The property type should be marked as optional with `?`

### `@Init`

The `@Init` decorator marks a method to be called during initialization of a service. This is useful for setup tasks that need to be performed after all dependencies are injected.

```typescript
class UserService {
  @Inject(Logger)
  private logger!: Logger;

  @Init()
  async initialize() {
    await this.logger.info('UserService initialized');
    // Perform initialization tasks
  }
}
```

#### Usage Notes

- The decorated method will be called after all dependencies are injected
- Can be async
- Multiple `@Init` methods are executed in the order they are defined

### `@Injectable`

The `@Injectable` decorator marks a class as injectable, allowing it to be automatically registered with the container.

```typescript
@Injectable()
class UserService {
  @Inject(Logger)
  private logger!: Logger;
}
```

#### Usage Notes

- When `autoBindInjectable` is enabled in the container options, decorated classes are automatically registered
- Useful for reducing boilerplate in service registration
- Can be used with interfaces to specify the service type

## Examples

### Basic Dependency Injection

```typescript
@Injectable()
class UserController {
  constructor(
    @Inject(UserService) private userService: UserService,
    @Inject(Logger) private logger: Logger
  ) {}

  async getUser(id: string) {
    this.logger.info(`Fetching user ${id}`);
    return this.userService.getUser(id);
  }
}
```

### Optional Dependencies

```typescript
@Injectable()
class NotificationService {
  @InjectOptional(EmailService)
  private emailService?: EmailService;

  @InjectOptional(SMSService)
  private smsService?: SMSService;

  async notify(user: User, message: string) {
    if (this.emailService) {
      await this.emailService.send(user.email, message);
    }
    if (this.smsService) {
      await this.smsService.send(user.phone, message);
    }
  }
}
```

### Initialization

```typescript
@Injectable()
class DatabaseService {
  @Inject(Logger)
  private logger!: Logger;

  private connection?: Connection;

  @Init()
  async initialize() {
    this.logger.info('Initializing database connection');
    this.connection = await this.connect();
    await this.runMigrations();
  }

  private async connect(): Promise<Connection> {
    // Connection logic
  }

  private async runMigrations(): Promise<void> {
    // Migration logic
  }
}
```

### Interface-based Injection

```typescript
interface ILogger {
  info(message: string): void;
  error(message: string): void;
}

@Injectable()
class ConsoleLogger implements ILogger {
  info(message: string): void {
    console.log(message);
  }

  error(message: string): void {
    console.error(message);
  }
}

@Injectable()
class UserService {
  @Inject(ILogger)
  private logger!: ILogger;
}
```

## Best Practices

1. **Use Constructor Injection When Possible**
   - Makes dependencies explicit
   - Easier to test
   - Better TypeScript support

2. **Use Property Injection for Optional Dependencies**
   - Clearer intent
   - More flexible
   - Better for circular dependencies

3. **Use `@Init` for Complex Setup**
   - Keep constructors simple
   - Handle async initialization
   - Perform setup tasks after injection

4. **Use Interfaces with `@Injectable`**
   - Better abstraction
   - Easier to swap implementations
   - More maintainable code

5. **Handle Optional Dependencies Gracefully**
   - Check for existence before use
   - Provide fallback behavior
   - Document optional nature

## See Also

- [Container](./container.md) - The core container class and its methods
- [Types](./types.md) - Type definitions used in the DI system
- [Advanced Topics](./advanced.md) - Advanced usage patterns and techniques 