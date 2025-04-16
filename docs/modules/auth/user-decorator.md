# User Decorator

The `User` decorator is a powerful tool in the Vercube framework for injecting the currently authenticated user into controller methods. It provides a convenient way to access user information without manually retrieving it from the request.

## Overview

The `User` decorator is designed to work seamlessly with the `Auth` decorator and the authentication system. It allows you to:

- Access the current user in controller methods
- Specify the type of the user object for better type safety
- Use a custom authentication provider for retrieving the user

## Usage

```typescript
import { User } from '@vercube/auth';

interface MyUser {
  id: number;
  username: string;
  roles: string[];
}

@Controller('/api')
export class UserController {
  @Get('/profile')
  @Auth()
  public async getProfile(@User() user: any): Promise<any> {
    // The user object is automatically injected
    return {
      id: user.id,
      username: user.username,
      email: user.email
    };
  }

  // With a specific user type
  @Get('/me')
  @Auth()
  public async getMe(@User() user: MyUser): Promise<MyUser> {
    // TypeScript now knows the structure of the user object
    return user;
  }

  // Using a custom authentication provider
  @Get('/custom-user')
  @Auth({ provider: CustomAuthProvider })
  public async getCustomUser(@User({ provider: CustomAuthProvider }) user: any): Promise<any> {
    // The user is retrieved using the specified provider
    return user;
  }
}
```

## Options

The `User` decorator accepts an optional `UserDecoratorOptions` object with the following properties:

```typescript
interface UserDecoratorOptions {
  /**
   * Optional custom auth provider to use for retrieving the current user
   * If not provided, the default AuthProvider will be used
   */
  provider?: typeof AuthProvider;
}
```

### `provider`

A custom authentication provider class to use for retrieving the user. If not provided, the default authentication provider registered in the dependency injection container will be used.

## How It Works

The `User` decorator works by:

1. Adding parameter information to the method metadata
2. Configuring a custom parameter resolver that retrieves the user from the appropriate `AuthProvider`
3. Injecting the user object into the method parameter when the route is called

When a request is made to a route with the `User` decorator:

1. The parameter resolver is called with the current request
2. It calls the `getCurrentUser` method of the appropriate `AuthProvider`
3. The returned user object is injected into the method parameter

## Type Safety

The `User` decorator supports TypeScript generics for better type safety. You can specify the exact type of the user object that will be injected:

```typescript
interface User {
  id: number;
  username: string;
  email: string;
  roles: string[];
}

@Controller('/api')
export class UserController {
  @Get('/profile')
  @Auth()
  public async getProfile(@User() user: User): Promise<User> {
    // TypeScript now knows the structure of the user object
    console.log(user.username); // OK
    console.log(user.nonexistentProperty); // TypeScript error
    
    return user;
  }
}
```

## Integration with Auth Decorator

The `User` decorator is designed to work seamlessly with the `Auth` decorator. When used together, they provide a complete authentication and user access solution:

```typescript
@Controller('/api')
export class UserController {
  @Get('/profile')
  @Auth() // Protect the route with authentication
  public async getProfile(@User() user: any): Promise<any> {
    // The route is protected, and the user is automatically injected
    return {
      message: `Hello, ${user.username}!`,
      profile: user
    };
  }
}
```

## See Also

- [Auth Provider](./auth-provider.md) - Documentation of the AuthProvider abstract class
- [Auth Decorator](./auth-decorator.md) - Documentation of the Auth decorator
- [Auth Types](./auth-types.md) - Type definitions for authentication options
- [Auth Implementations](./auth-implementations.md) - Available authentication implementations 