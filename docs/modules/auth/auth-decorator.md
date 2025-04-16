# Auth Decorator

The `Auth` decorator is a powerful tool in the Vercube framework for protecting routes and controllers with authentication and authorization. It allows you to easily secure your application's endpoints by specifying authentication requirements.

## Overview

The `Auth` decorator adds authentication middleware to the decorated target (class or method). It can be used to:

- Protect routes with basic authentication
- Implement role-based access control
- Specify custom authentication providers for specific routes

## Usage

```typescript
import { Auth } from '@vercube/auth';

@Controller('/api')
export class UserController {
  // Basic authentication - requires a valid user
  @Get('/profile')
  @Auth()
  public async getProfile(): Promise<any> {
    // This route is protected and requires authentication
    return { message: 'Profile data' };
  }

  // Role-based authorization - requires a user with the 'admin' role
  @Get('/admin')
  @Auth({ roles: ['admin'] })
  public async adminOnly(): Promise<{ message: string }> {
    // This route is protected and requires the 'admin' role
    return { message: 'Admin access granted' };
  }

  // Using a custom authentication provider
  @Get('/custom-auth')
  @Auth({ provider: CustomAuthProvider })
  public async customAuth(): Promise<{ message: string }> {
    // This route uses a custom authentication provider
    return { message: 'Custom authentication successful' };
  }
}
```

## Options

The `Auth` decorator accepts an optional `AuthTypes.MiddlewareOptions` object with the following properties:

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

### `roles`

An array of role strings that the authenticated user must have to access the route. If not provided or empty, the route only requires authentication without specific role requirements.

### `provider`

A custom authentication provider class to use for this specific route. If not provided, the default authentication provider registered in the dependency injection container will be used.

## How It Works

The `Auth` decorator works by:

1. Adding the `AuthMiddleware` to the metadata of the decorated target
2. Configuring the middleware with the provided options
3. Ensuring the middleware runs before the route handler

When a request is made to a protected route:

1. The `AuthMiddleware` intercepts the request
2. It calls the `validate` method of the appropriate `AuthProvider`
3. If validation fails (returns an error message), the request is rejected with a 401 Unauthorized response
4. If validation succeeds (returns null), the request proceeds to the route handler

## Class-Level Usage

You can apply the `Auth` decorator to an entire controller class to protect all routes within that controller:

```typescript
@Controller('/api')
@Auth({ roles: ['user'] }) // All routes in this controller require the 'user' role
export class UserController {
  @Get('/profile')
  public async getProfile(): Promise<any> {
    // This route is protected and requires the 'user' role
    return { message: 'Profile data' };
  }

  @Get('/settings')
  public async getSettings(): Promise<any> {
    // This route is also protected and requires the 'user' role
    return { message: 'Settings data' };
  }
}
```

## Method-Level Usage

You can also apply the `Auth` decorator to specific methods within a controller to protect only those routes:

```typescript
@Controller('/api')
export class MixedController {
  @Get('/public')
  public async publicRoute(): Promise<any> {
    // This route is not protected
    return { message: 'Public data' };
  }

  @Get('/private')
  @Auth() // This route requires authentication
  public async privateRoute(): Promise<any> {
    // This route is protected and requires authentication
    return { message: 'Private data' };
  }

  @Get('/admin')
  @Auth({ roles: ['admin'] }) // This route requires the 'admin' role
  public async adminRoute(): Promise<any> {
    // This route is protected and requires the 'admin' role
    return { message: 'Admin data' };
  }
}
```

## See Also

- [Auth Provider](./auth-provider.md) - Documentation of the AuthProvider abstract class
- [User Decorator](./user-decorator.md) - Documentation of the User decorator
- [Auth Types](./auth-types.md) - Type definitions for authentication options
- [Auth Implementations](./auth-implementations.md) - Available authentication implementations 