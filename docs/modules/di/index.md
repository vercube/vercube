# Dependency Injection API

Vercube provides a powerful and flexible dependency injection (DI) system that helps manage dependencies and promote loose coupling in your application. This documentation covers the complete API of the `@vercube/di` package.

## Install
The easiest way to get started with Vercube DI is to use install package:
::: code-group

```bash [pnpm]
$ pnpm add @vercube/di
```
```bash [npm]
$ npm i @vercube/di
```
```bash [yarn]
$ yarn add @vercube/di
```
```bash [bun]
$ bun add @vercube/di
```
:::

## Overview

The dependency injection system in Vercube consists of several key components:

1. **Container**: The central registry that manages all dependencies and their lifecycle
2. **Decorators**: A set of decorators for declaring and injecting dependencies
3. **Service Registration**: Methods for registering services with different scopes
4. **Dependency Resolution**: Automatic resolution of dependencies when needed

## Table of Contents

- [Container](./container.md) - The core container class and its methods
- [Decorators](./decorators.md) - Available decorators for dependency injection
- [Types](./types.md) - Type definitions used in the DI system
- [Advanced Topics](./advanced.md) - Advanced usage patterns and techniques

## Quick Start

```typescript
import { Container, Inject } from '@vercube/di';

// Create a container
const container = new Container();

// Register a service
container.bind(Logger, ConsoleLogger);

// Use dependency injection in a class
class UserService {
  @Inject(Logger)
  private logger!: Logger;

  async getUser(id: string) {
    this.logger.info(`Fetching user ${id}`);
    // ...
  }
}

// Resolve a service with its dependencies
const userService = container.resolve(UserService);
```

## Core Concepts

### Container

The Container is the heart of the dependency injection system. It manages the registration and resolution of dependencies. See the [Container documentation](./container.md) for details.

### Service Registration

Services can be registered in different ways:

- **Singleton**: One instance shared across the application
- **Transient**: New instance for each request
- **Instance**: An existing instance
- **Mock**: A mock implementation for testing

### Dependency Injection

Dependencies are injected using decorators:

- `@Inject`: Injects a required dependency
- `@InjectOptional`: Injects an optional dependency
- `@Init`: Marks a method to be called during initialization

### Service Resolution

Services can be resolved in different ways:

- `container.get()`: Get a service instance
- `container.getOptional()`: Get an optional service instance
- `container.resolve()`: Create a new instance with dependencies automatically resolved

## Best Practices

1. **Use Constructor Injection When Possible**
   ```typescript
   class UserController {
     constructor(
       @Inject(UserService) private userService: UserService,
       @Inject(Logger) private logger: Logger
     ) {}
   }
   ```

2. **Register Services Early**
   ```typescript
   // In your application bootstrap
   container.bind(Logger, ConsoleLogger);
   container.bind(UserService);
   container.bind(UserController);
   ```

3. **Use Interfaces for Better Abstraction**
   ```typescript
   interface ILogger {
     info(message: string): void;
     error(message: string): void;
   }

   class UserService {
     @Inject(ILogger)
     private logger!: ILogger;
   }
   ```

4. **Keep Services Focused**
   ```typescript
   // Good
   class UserService {
     @Inject(UserRepository)
     private userRepository!: UserRepository;
   }

   // Bad - too many dependencies
   class UserService {
     @Inject(UserRepository)
     private userRepository!: UserRepository;
     @Inject(EmailService)
     private emailService!: EmailService;
     @Inject(PaymentService)
     private paymentService!: PaymentService;
     @Inject(NotificationService)
     private notificationService!: NotificationService;
   }
   ```

## See Also

- [Dependency Injection Guide](../../guide/dependency-injection.md) - Conceptual overview of DI in Vercube
- [Decorators](./decorators.md) - Available decorators for dependency injection
- [Types](./types.md) - Type definitions used in the DI system
- [Advanced Topics](./advanced.md) - Advanced usage patterns and techniques 
