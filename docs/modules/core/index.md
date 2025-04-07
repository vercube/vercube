# Core Module

The Core module is the foundation of the Vercube framework, providing essential functionality for building web applications. It includes the application lifecycle, dependency injection, routing, middleware, error handling, and validation.

## Overview

The Core module provides the following key components:

1. **Application** - The main application class that manages the application lifecycle
2. **Container** - A dependency injection container for managing dependencies
3. **Decorators** - Decorators for defining routes, middleware, and other application components
4. **Error Handling** - A system for handling and reporting errors
5. **Hooks** - A service for managing application lifecycle hooks
6. **Validation** - A validation system based on the Standard Schema specification

## Table of Contents

- [Application](./application.md) - Application lifecycle and configuration
- [Decorators](./decorators.md) - Core decorators for defining application components
- [Error Handling](./error-handling.md) - Error handling system
- [Hooks](./hooks.md) - Application lifecycle hooks
- [Validation](./validation.md) - Data validation system

## Quick Start

```typescript
import { createApp } from '@vercube/core';
import { useContainer } from './Boot/Container';

async function main() {
  const app = await createApp();
  app.container.expand(useContainer);
  await app.listen();
}

await main();
```

## Core Concepts

### Application

The Application class is the main entry point for a Vercube application. It manages the application lifecycle, including initialization, routing, and listening for incoming requests.

### Container

The Container is a dependency injection container that manages dependencies in your application. It allows you to bind services to the container and resolve them when needed.

### Decorators

Decorators are used to define routes, middleware, and other application components. They provide a declarative way to define application behavior.

### Error Handling

The Error Handling system provides a way to handle and report errors in your application. It includes error handlers, error reporting, and error logging.

### Hooks

The Hooks service provides a way to define and execute hooks at various points in the application lifecycle, such as before and after request handling.

### Validation

The Validation system provides a way to validate data in your application. It is based on the Standard Schema specification, which provides a common interface for schema validation libraries.

## Best Practices

1. **Application Structure**
   - Organize your application into modules
   - Use dependency injection for loose coupling
   - Define routes using decorators
   - Use middleware for cross-cutting concerns

2. **Error Handling**
   - Define global error handlers
   - Use try-catch blocks for handling specific errors
   - Log errors with appropriate context
   - Return appropriate error responses

3. **Validation**
   - Validate input data at the boundaries of your application
   - Use the Standard Schema specification for validation
   - Provide clear error messages for validation failures
   - Consider using custom validators for complex validation logic

4. **Hooks**
   - Use hooks for cross-cutting concerns
   - Define hooks for application lifecycle events
   - Use hooks for logging, monitoring, and other non-functional requirements
   - Keep hook handlers focused and lightweight

## See Also

- [DI Module](../di/index.md) - Dependency injection system
- [Logger Module](../logger/index.md) - Logging system
- [Getting Started](../../guide/getting-started.md) - How to get started with Vercube
