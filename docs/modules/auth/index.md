# Auth Module

The Auth module provides a flexible and extensible authentication and authorization system for Vercube applications. It offers a unified interface for different authentication implementations through a dependency injection-based architecture.

## Overview

The Auth module consists of:

- **AuthProvider**: An abstract base class that defines the interface for authentication implementations
- **Auth Decorator**: A decorator for protecting routes and controllers with authentication
- **User Decorator**: A decorator for injecting the current user into controller methods
- **AuthMiddleware**: Middleware that handles authentication and authorization
- **Auth Types**: Type definitions for authentication options and configurations

## Key Features

- **Flexible Authentication**: Support for various authentication methods (JWT, Basic Auth, etc.)
- **Role-Based Authorization**: Protect routes based on user roles
- **Dependency Injection**: Seamlessly integrates with Vercube's DI system
- **Type Safety**: Full TypeScript support with generic types for user objects
- **Extensible**: Create custom authentication providers by extending the AuthProvider abstract class
- **Decorator-Based API**: Simple and intuitive API using decorators

## Basic Usage

```typescript
import { Container } from '@vercube/di';
import { AuthProvider } from '@vercube/auth';
import { Auth, User } from '@vercube/auth';

// Create a custom auth provider
class CustomAuthProvider extends AuthProvider {
  public validate(request: Request): string | null {
    // Implement authentication logic
    return null; // Return null if authenticated, error message if not
  }

  public getCurrentUser(request: Request): any {
    // Return the current user
    return { id: 1, name: 'John Doe' };
  }
}

// Configure the container
export function useContainer(container: Container): Container {
  // Bind the custom auth provider to the container
  container.bind(AuthProvider, CustomAuthProvider);
  
  return container;
}

// Use in controllers
@Controller('/api')
export class UserController {
  @Get('/profile')
  @Auth() // Protect the route with authentication
  public async getProfile(@User() user: any): Promise<any> {
    return user;
  }

  @Get('/admin')
  @Auth({ roles: ['admin'] }) // Protect the route with role-based authorization
  public async adminOnly(): Promise<{ message: string }> {
    return { message: 'Admin access granted' };
  }
}
```

## See Also

- [Auth Provider](./auth-provider.md) - Documentation of the AuthProvider abstract class
- [Auth Decorator](./auth-decorator.md) - Documentation of the Auth decorator
- [User Decorator](./user-decorator.md) - Documentation of the User decorator
- [Auth Types](./auth-types.md) - Type definitions for authentication options
- [Auth Implementations](./auth-implementations.md) - Available authentication implementations