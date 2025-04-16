# Auth Provider

The `AuthProvider` is an abstract base class that defines the interface for authentication implementations in the Vercube framework. It provides a common contract that all authentication providers must implement.

## Overview

The `AuthProvider` class serves as the foundation for implementing various authentication strategies such as JWT, Basic Auth, OAuth, or custom authentication methods. By extending this class, you can create authentication providers that integrate seamlessly with Vercube's authentication system.

## Class Definition

```typescript
export abstract class AuthProvider<U = unknown> {
  /**
   * Validate authentication
   * @param {Request} request - The request object
   * @param {AuthTypes.MiddlewareOptions} params - Additional parameters
   * @returns An error string or Promise of error string, null or Promise of null if authentication is successful
   */
  public abstract validate(request: Request, params?: AuthTypes.MiddlewareOptions): Promise<string | null> | string | null;

  /**
   * Get current user
   * @param {Request} request - The request object
   * @returns A promise of the current user or null if no user is authenticated
   */
  public abstract getCurrentUser(request: Request): Promise<U | null> | U | null;
}
```

## Methods

### `validate`

The `validate` method is responsible for authenticating the incoming request. It should:

1. Extract authentication credentials from the request (e.g., from headers, cookies, etc.)
2. Verify the credentials against your authentication system
3. Return `null` if authentication is successful, or an error message string if authentication fails

This method is called by the `AuthMiddleware` to determine if a request should be allowed to proceed.

### `getCurrentUser`

The `getCurrentUser` method retrieves the currently authenticated user from the request. It should:

1. Extract user information from the request
2. Return the user object if a user is authenticated, or `null` if no user is authenticated

This method is used by the `User` decorator to inject the current user into controller methods.

## Generic Type Parameter

The `AuthProvider` class accepts a generic type parameter `U` that represents the type of the user object. This allows you to specify the exact type of the user object that your authentication provider will return.

## Example Implementation

Here's an example of a custom authentication provider that implements JWT authentication:

```typescript
import { AuthProvider, type AuthTypes } from '@vercube/auth';

interface JWTUser {
  id: number;
  username: string;
  roles: string[];
}

export class JWTAuthProvider extends AuthProvider<JWTUser> {
  private secret: string;

  constructor(secret: string) {
    super();
    this.secret = secret;
  }

  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): string | null {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return 'No token provided';
    }

    try {
      // Verify the JWT token
      const decoded = this.verifyToken(token);
      
      // Check roles if specified
      if (params?.roles && params.roles.length > 0) {
        const hasRequiredRole = params.roles.some(role => 
          decoded.roles.includes(role)
        );
        
        if (!hasRequiredRole) {
          return 'Insufficient permissions';
        }
      }
      
      return null; // Authentication successful
    } catch (error) {
      return 'Invalid token';
    }
  }

  public getCurrentUser(request: Request): JWTUser | null {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return null;
    }

    try {
      // Decode the JWT token
      return this.verifyToken(token);
    } catch (error) {
      return null;
    }
  }

  private verifyToken(token: string): JWTUser {
    // Implement JWT verification logic
    // This is a simplified example
    return {
      id: 1,
      username: 'john.doe',
      roles: ['user']
    };
  }
}
```

## Integration with Dependency Injection

To use your custom authentication provider with Vercube's dependency injection system, you need to bind it to the container:

```typescript
import { Container } from '@vercube/di';
import { AuthProvider } from '@vercube/auth';
import { JWTAuthProvider } from './JWTAuthProvider';

export function useContainer(container: Container): Container {
  // Bind the JWT auth provider to the container
  container.bind(AuthProvider, JWTAuthProvider);
  
  return container;
}
```

## See Also

- [Auth Types](./auth-types.md) - Type definitions for authentication options
- [Auth Decorator](./auth-decorator.md) - Documentation of the Auth decorator
- [User Decorator](./user-decorator.md) - Documentation of the User decorator
- [Auth Implementations](./auth-implementations.md) - Available authentication implementations 