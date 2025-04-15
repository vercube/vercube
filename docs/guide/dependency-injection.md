# Dependency Injection: The Core of Vercube

Vercube is fundamentally built around the concept of dependency injection (DI) as its core architectural principle. This document explains how DI permeates every aspect of the framework and how it shapes the entire project's design and functionality.

## The DI-First Architecture

Vercube's architecture is designed with dependency injection as its foundation, not just as an add-on feature. This DI-first approach influences:

1. **Framework Core**: The entire framework is built on a dependency injection container
2. **Service Organization**: All services are designed to be injectable and loosely coupled
3. **Plugin System**: Plugins are integrated through the DI system
4. **HTTP Layer**: Controllers and middleware use DI for dependency management
5. **Configuration**: Application configuration is managed through DI
6. **Testing**: The testing infrastructure leverages DI for mocking and isolation

## How DI Shapes Vercube

### 1. Application Bootstrap

The application bootstrap process is entirely DI-driven. When you create a new Vercube application, the framework automatically sets up a dependency injection container that manages all the core services. This container is responsible for creating and managing the lifecycle of all services in your application.

The bootstrap process follows these steps:
1. Creates a DI container
2. Registers core services
3. Loads configuration
4. Initializes plugins
5. Sets up the HTTP server

This approach ensures that all components of your application are properly initialized and connected through the dependency injection system.

### 2. Service Registration

All framework services are registered through the DI container. This includes core services like the Logger, ErrorHandlerProvider, HttpServer, Router, RequestHandler, and MetadataResolver. By registering these services through the container, Vercube ensures that they can be easily replaced or extended as needed.

The service registration process is designed to be flexible, allowing you to:
- Register services as singletons (shared across the application)
- Register services as transient (new instance for each request)
- Register existing instances
- Register mock implementations for testing

### 3. Controller Implementation

Controllers in Vercube are designed to work with dependency injection. This means that instead of manually creating instances of services that your controllers depend on, you simply declare those dependencies using the `@Inject` decorator. The framework will automatically provide the appropriate instances when your controller methods are called.

This approach has several benefits:
- Controllers are more testable since dependencies can be easily mocked
- Controllers are more maintainable since dependencies are explicitly declared
- Controllers are more flexible since dependencies can be swapped out without changing the controller code

### 4. Middleware System

Middleware in Vercube is integrated through the dependency injection system. This means that middleware can easily access any service it needs by simply declaring those dependencies using the `@Inject` decorator. The framework will automatically provide the appropriate instances when the middleware is executed.

This approach allows middleware to be:
- More testable since dependencies can be easily mocked
- More maintainable since dependencies are explicitly declared
- More flexible since dependencies can be swapped out without changing the middleware code

### 5. Plugin Architecture

Plugins in Vercube are designed to extend the dependency injection container. When a plugin is initialized, it can register new services with the container, allowing it to add new functionality to the framework without modifying the core code.

This approach allows plugins to:
- Add new services to the application
- Replace existing services with custom implementations
- Extend the functionality of existing services

### 6. HTTP Request Processing

The entire HTTP request processing pipeline in Vercube is driven by the dependency injection system. When a request is received, the framework uses the container to resolve the appropriate controller and its dependencies, execute the controller method, and generate the response.

This approach ensures that:
- Request processing is consistent and predictable
- Dependencies are properly managed throughout the request lifecycle
- Error handling is centralized and consistent

### 7. Configuration Management

Configuration in Vercube is managed through the dependency injection system. This means that configuration values can be easily accessed by any service that needs them by simply declaring a dependency on the configuration service.

This approach allows for:
- Environment-specific configuration
- Dynamic configuration changes
- Centralized configuration management

## The Benefits of DI-First Architecture

### 1. Modularity

The DI-first approach enables true modularity in your application. By using dependency injection, you can:

- Develop and test services in isolation
- Replace components without affecting the rest of the system
- Add new functionality through plugins without modifying core code

This modularity makes your application more maintainable and easier to extend.

### 2. Testability

Testing is greatly simplified through dependency injection. By using the DI container, you can:

- Easily mock dependencies for unit testing
- Isolate components for testing
- Test components in different configurations

This makes it easier to write comprehensive tests for your application.

### 3. Flexibility

The system is highly flexible, allowing you to:

- Swap out services with different implementations
- Change configuration without modifying code
- Add new features through plugins

This flexibility makes your application more adaptable to changing requirements.

### 4. Maintainability

Code is more maintainable when using dependency injection:

- Dependencies are explicit and documented
- Components have clear responsibilities
- Changes are localized and don't propagate throughout the system

This makes your code easier to understand and modify.

## Practical Implementation

While the conceptual understanding of DI is important, Vercube provides a practical implementation that makes it easy to use in your applications. Here are some key aspects of the implementation:

### Container

The Container is the heart of the dependency injection system. It manages the registration and resolution of dependencies.

```typescript
import { Container } from '@vercube/di';

// Create a new container
const container = new Container();

// Or with custom options
const container = new Container({
  createLocked: false,
  injectMethod: 'STATIC' // or 'LAZY'
});
```

### Service Registration

The Container provides several methods for registering services:

```typescript
// Register a service as a singleton
container.bind(Logger, ConsoleLogger);

// Register a service as transient (new instance each time)
container.bindTransient(RequestHandler, CustomRequestHandler);

// Register an existing instance
const logger = new ConsoleLogger();
container.bindInstance(Logger, logger);

// Register a mock implementation for testing
container.bindMock(HttpServer, {
  listen: jest.fn(),
  // ... other mock methods
});
```

### Dependency Injection

Vercube provides decorators for declaring and injecting dependencies:

```typescript
import { Inject, InjectOptional, Init } from '@vercube/di';

class UserService {
  @Inject(Logger)
  private logger!: Logger;

  @Inject(UserRepository)
  private userRepository!: UserRepository;

  @InjectOptional(AnalyticsProvider)
  private analytics?: AnalyticsProvider;

  @Init()
  private async initialize() {
    // Initialization logic
  }

  async getUser(id: string) {
    this.logger.info(`Fetching user ${id}`);
    return this.userRepository.findById(id);
  }
}
```

### Service Resolution

Services can be resolved manually or automatically:

```typescript
// Manual resolution
const logger = container.get(Logger);
const analytics = container.getOptional(AnalyticsProvider);

// Automatic resolution
const userService = container.resolve(UserService);
```

## Best Practices

When working with Vercube's DI system, consider these best practices:

1. **Use Property Injection**
   ```typescript
   class UserService {
     @Inject(Logger)
     private logger!: Logger;
     
     @Inject(UserRepository)
     private userRepository!: UserRepository;
   }
   ```

2. **Use Interfaces for Better Abstraction**
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

3. **Keep Services Focused**
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

## Detailed DI API Documentation

For a complete reference of the dependency injection API in Vercube, including all available decorators, container methods, and configuration options, please refer to the [Dependency Injection API Documentation](/modules/di/). This document provides detailed information about:

- The `Container` class and its methods
- The `@Inject` and `@InjectOptional` decorators
- The `@Init` decorator for initialization
- Service registration methods
- Service resolution methods
- Container configuration options
- Advanced topics like custom decorators and service lifecycle

## Conclusion

Vercube's dependency injection-first architecture is not just a feature—it's the foundation that shapes the entire framework. By building everything around DI, Vercube achieves:

- **Loose Coupling**: Components interact through well-defined interfaces
- **High Cohesion**: Each component has a single, well-defined responsibility
- **Extensibility**: New functionality can be added without modifying existing code
- **Testability**: Components can be tested in isolation
- **Maintainability**: Code is organized in a clear, predictable way

This DI-first approach makes Vercube a powerful, flexible, and maintainable framework for building modern web applications. 