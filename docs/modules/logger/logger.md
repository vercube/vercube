# Logger Class

The `Logger` class is the core interface for logging in Vercube. It provides a standardized way to log messages at different levels and is designed to be extensible through providers.

## Interface

```typescript
abstract class Logger {
  abstract configure(options: LoggerTypes.LoggerOptions): void;
  abstract debug(message: string, ...args: any[]): void;
  abstract info(message: string, ...args: any[]): void;
  abstract warn(message: string, ...args: any[]): void;
  abstract error(message: string, ...args: any[]): void;
}
```

## BaseLogger Implementation

The `BaseLogger` class is the default implementation of the `Logger` interface. It provides a complete implementation that can be configured with different providers and log levels.

### Configuration

The `configure` method sets up the logger with the provided options:

```typescript
configure(options: LoggerTypes.LoggerOptions): void {
  this.logLevel = options.logLevel || 'info';
  
  // Configure providers
  if (options.providers) {
    options.providers.forEach(providerConfig => {
      const provider = new providerConfig.provider();
      provider.initialize(providerConfig.options);
      this.providers.set(providerConfig.name, provider);
    });
  }
}
```

### Logging Methods

The `BaseLogger` implements four logging methods:

```typescript
debug(message: string, ...args: any[]): void {
  if (this.isLogLevelEnabled('debug')) {
    this.log('debug', message, ...args);
  }
}

info(message: string, ...args: any[]): void {
  if (this.isLogLevelEnabled('info')) {
    this.log('info', message, ...args);
  }
}

warn(message: string, ...args: any[]): void {
  if (this.isLogLevelEnabled('warn')) {
    this.log('warn', message, ...args);
  }
}

error(message: string, ...args: any[]): void {
  if (this.isLogLevelEnabled('error')) {
    this.log('error', message, ...args);
  }
}
```

## Usage Examples

### Basic Usage

::: code-group
```typescript [container.ts]
export function useContainer(container: Container): Container {

  // Bind the logger to the container
  container.bind(Logger, BaseLogger);

  // Configure the logger
  container.get(Logger).configure({
    logLevel: 'info',
    providers: [
      {
        name: 'console',
        provider: ConsoleProvider,
        logLevel: 'debug'
      }
    ]
  });
}
```
```typescript [service.ts]
export class ExampleService {

  @Inject(Logger)
  private logger: Logger;

  public someMethod(): void {
    this.logger.info('Application started');
    this.logger.debug('Debug information', { userId: 123 });
    this.logger.warn('Warning message', new Error('Something went wrong'));
    this.logger.error('Error occurred', new Error('Critical error'));
  }

}
```
:::

::: code-group
```typescript [container.ts]
export function useContainer(container: Container): Container {

  // Bind the logger to the container
  container.bind(Logger, BaseLogger);

  // Configure the logger
  container.get(Logger).configure({
    logLevel: 'info',
    providers: [
      {
        name: 'console',
        provider: ConsoleProvider,
        logLevel: 'debug'
      },
      {
        name: 'json',
        provider: JSONProvider,
        logLevel: 'info',
        options: {
          pretty: true
        }
      }
    ]
  });
}
```
```typescript [service.ts]
export class ExampleService {

  @Inject(Logger)
  private logger: Logger;

  public someMethod(): void {
    this.logger.info('Application started');
    this.logger.debug('Debug information', { userId: 123 });
    this.logger.warn('Warning message', new Error('Something went wrong'));
    this.logger.error('Error occurred', new Error('Critical error'));
  }

}
```
:::

### Using Dependency Injection in a Service

```typescript
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';

class UserService {
  @Inject(Logger)
  private logger: Logger

  createUser(userData: any) {
    this.logger.info('Creating new user', { userId: userData.id });
    // User creation logic
  }
}
```

## Best Practices

1. **Singleton Pattern**
   - Use the DI container to manage logger instances
   - Bind the logger as a singleton in your container
   - Inject the logger into services that need logging

2. **Configuration**
   - Configure the logger early in your application startup
   - Set appropriate log levels for different environments
   - Configure providers based on your needs

3. **Log Messages**
   - Use clear and descriptive messages
   - Include relevant context in log messages
   - Use appropriate log levels

4. **Error Handling**
   - Always include error objects in error logs
   - Add stack traces when available
   - Include relevant context with errors

## See Also

- [Providers](./providers.md) - Available log providers
- [Types](./types.md) - Type definitions
- [Advanced Topics](./advanced.md) - Advanced usage patterns 