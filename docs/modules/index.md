# Vercube Modules

Vercube is built with a modular architecture, allowing you to use only the components you need for your application. This section provides documentation for each module in the Vercube ecosystem.

## Core Modules

### Core

The Core module is the foundation of the Vercube framework, providing essential functionality for building web applications.

- [Core Documentation](./core/index.md) - Overview of the Core module
- [App](./core/app.md) - Application lifecycle and configuration
- [Container](./core/container.md) - Dependency injection container
- [Router](./core/router.md) - Routing system
- [Middleware](./core/middleware.md) - Middleware system
- [Error Handling](./core/error-handling.md) - Error handling system

### DI (Dependency Injection)

The DI module provides a powerful dependency injection system for managing dependencies in your application.

- [DI Overview](./di/index.md) - Overview of the DI system
- [Container](./di/container.md) - Container implementation
- [Decorators](./di/decorators.md) - DI decorators
- [Types](./di/types.md) - Type definitions
- [Advanced Topics](./di/advanced.md) - Advanced DI patterns

### Logger

The Logger module provides a flexible and extensible logging system for your application.

- [Logger Overview](./logger/index.md) - Overview of the Logger system
- [Logger Class](./logger/logger.md) - Logger implementation
- [Providers](./logger/providers.md) - Log providers
- [Types](./logger/types.md) - Type definitions
- [Advanced Topics](./logger/advanced.md) - Advanced logging patterns

## Module Architecture

Vercube modules follow these design principles:

1. **Modularity** - Each module is self-contained and can be used independently
2. **Dependency Injection** - Modules use the DI system for loose coupling
3. **Extensibility** - Modules can be extended with custom implementations
4. **Type Safety** - Full TypeScript support with comprehensive type definitions
5. **Performance** - Optimized for high performance with minimal overhead

## Contributing to Modules

We welcome contributions to Vercube modules. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## See Also

- [Getting Started](../../guide/getting-started.md) - How to get started with Vercube
- [Architecture](../../guide/architecture.md) - Vercube architecture overview
- [Best Practices](../../guide/best-practices.md) - Best practices for using Vercube
