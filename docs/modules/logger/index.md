# Logger API

Vercube provides a flexible and extensible logging system through the `@vercube/logger` package. This documentation covers the complete API of the logger package.

## Install
The easiest way to get started with Vercube Logger is to use install package:
::: code-group

```bash [pnpm]
$ pnpm add @vercube/logger
```
```bash [npm]
$ npm i @vercube/logger
```
```bash [yarn]
$ yarn add @vercube/logger
```
```bash [bun]
$ bun add @vercube/logger
```
:::

## Overview

The logging system in Vercube consists of several key components:

1. **Logger**: The main interface for logging messages at different levels
2. **LoggerProvider**: Abstract base class for implementing log providers
3. **BaseLogger**: Default implementation of the Logger interface
4. **Built-in Providers**: Console and JSON providers for outputting logs

## Table of Contents

- [Logger](./logger.md) - The main Logger interface and BaseLogger implementation
- [Providers](./providers.md) - Available log providers and how to create custom ones
- [Types](./types.md) - Type definitions used in the logging system
- [Advanced Topics](./advanced.md) - Advanced usage patterns and techniques

## Quick Start

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

## Core Concepts

### Logger

The Logger is the main interface for logging messages. It provides methods for logging at different levels:

- `debug()`: For detailed debugging information
- `info()`: For general operational information
- `warn()`: For warning messages
- `error()`: For error messages

### LoggerProvider

LoggerProvider is an abstract base class for implementing log providers. Providers are responsible for processing and outputting log messages to various destinations.

### Log Levels

Vercube's logger supports four log levels:

- **debug**: Detailed information for debugging
- **info**: General information about application operation
- **warn**: Warning messages for potentially harmful situations
- **error**: Error messages for serious issues

Log levels are hierarchical, meaning that if you set the log level to `warn`, only `warn` and `error` messages will be processed.

## Best Practices

1. **Use Appropriate Log Levels**
   - `debug`: For detailed information useful during development
   - `info`: For general operational information
   - `warn`: For potentially harmful situations
   - `error`: For errors that need attention

2. **Include Context in Log Messages**
   - Add relevant data to help with debugging
   - Include request IDs for tracking requests
   - Add user IDs for user-related operations

3. **Use Structured Logging for Production**
   - Use the JSONProvider in production
   - Include timestamps and log levels
   - Add correlation IDs for distributed tracing

4. **Configure Different Log Levels for Different Environments**
   - More verbose in development
   - More restrictive in production

5. **Handle Sensitive Information**
   - Never log passwords or tokens
   - Mask sensitive data before logging
   - Be careful with user input in logs

## See Also

- [Dependency Injection](../../guide/dependency-injection.md) - How to inject the logger into your services
- [Error Handling](../../guide/error-handling.md) - How to use the logger with error handling 