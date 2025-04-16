# Auth Types

The Auth module provides a set of TypeScript types and interfaces that define the structure and behavior of the authentication system. These types ensure type safety and provide clear documentation for the authentication API.

## Overview

The Auth types are organized in the `AuthTypes` namespace and include:

- `MiddlewareOptions`: Options for the Auth decorator and middleware
- Other types related to authentication and authorization

## MiddlewareOptions

The `MiddlewareOptions` interface defines the options that can be passed to the `Auth` decorator and used by the `AuthMiddleware`.

```typescript
export interface MiddlewareOptions {
  /**
   * Roles to authorize
   * @default []
   */
  roles?: string[];
  
  /**
   * Override provider to use for authorization
   * Default one is set inside of the IOC container
   */
  provider?: typeof AuthProvider;
}
```

### Properties

#### `roles`

An optional array of role strings that the authenticated user must have to access the route. If not provided or empty, the route only requires authentication without specific role requirements.

Example:
```typescript
@Auth({ roles: ['admin', 'moderator'] })
public async adminRoute(): Promise<any> {
  // This route requires the user to have either the 'admin' or 'moderator' role
  return { message: 'Access granted' };
}
```

#### `provider`

An optional reference to a custom authentication provider class to use for this specific route. If not provided, the default authentication provider registered in the dependency injection container will be used.

Example:
```typescript
@Auth({ provider: CustomAuthProvider })
public async customAuthRoute(): Promise<any> {
  // This route uses the CustomAuthProvider for authentication
  return { message: 'Custom authentication successful' };
}
```

## UserDecoratorOptions

The `UserDecoratorOptions` interface defines the options that can be passed to the `User` decorator.

```typescript
interface UserDecoratorOptions {
  /**
   * Optional custom auth provider to use for retrieving the current user
   * If not provided, the default AuthProvider will be used
   */
  provider?: typeof AuthProvider;
}
```

### Properties

#### `provider`

An optional reference to a custom authentication provider class to use for retrieving the current user. If not provided, the default authentication provider registered in the dependency injection container will be used.

Example:
```typescript
@Get('/custom-user')
public async getCustomUser(@User({ provider: CustomAuthProvider }) user: any): Promise<any> {
  // The user is retrieved using the specified provider
  return user;
}
```

## Type Safety with Generics

The `AuthProvider` class accepts a generic type parameter `U` that represents the type of the user object. This allows you to specify the exact type of the user object that your authentication provider will return.

```typescript
// Define a user interface
interface User {
  id: number;
  username: string;
  email: string;
  roles: string[];
}

// Create an auth provider with the User type
class CustomAuthProvider extends AuthProvider<User> {
  // Implementation...
}

// Use the provider with type safety
@Get('/profile')
@Auth({ provider: CustomAuthProvider })
public async getProfile(@User() user: User): Promise<User> {
  // TypeScript now knows the structure of the user object
  return user;
}
```

## See Also

- [Auth Provider](./auth-provider.md) - Documentation of the AuthProvider abstract class
- [Auth Decorator](./auth-decorator.md) - Documentation of the Auth decorator
- [User Decorator](./user-decorator.md) - Documentation of the User decorator
- [Auth Implementations](./auth-implementations.md) - Available authentication implementations 