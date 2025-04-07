# Error Handling

Error handling in Vercube is designed to be flexible, consistent, and developer-friendly. This guide explains how errors are handled in the framework, how to create custom error handlers, and how to use the built-in HTTP error classes.

## Overview

The error handling system in Vercube consists of several components:

1. **Error Handler Provider**: A service that processes errors and converts them to appropriate HTTP responses
2. **HTTP Error Classes**: A set of predefined error classes for common HTTP error scenarios
3. **Error Handling Flow**: The process by which errors are caught, processed, and returned to the client

## Error Handler Provider

The `ErrorHandlerProvider` is an abstract class that defines the interface for error handlers in Vercube. The framework includes a default implementation ([`DefaultErrorHandlerProvider`](https://github.com/vercube/vercube/blob/main/packages/core/src/Services/ErrorHandler/DefaultErrorHandlerProvider.ts)), but you can create your own custom error handler by extending the `ErrorHandlerProvider` class.

### Default Error Handler

The `DefaultErrorHandlerProvider` is the default error handler in Vercube. It:

1. Checks if the error is an instance of `HttpError`
2. If it is, returns a response with the error details and the appropriate status code
3. If not, logs the error and returns a generic internal server error response

```typescript
import { ErrorHandlerProvider } from '@vercube/core';
import { InternalServerError } from '@vercube/core';
import { HttpError } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { Inject } from '@vercube/di';

export class DefaultErrorHandlerProvider extends ErrorHandlerProvider {
  @Inject(Logger)
  private gLogger: Logger;

  public handleError(error: Error): Response {
    const _internalError = new InternalServerError();
    const status = (error as any)?.status ?? 500;

    // Check if the error is a known error type and return it
    if (error instanceof HttpError) {
      return new Response(JSON.stringify({ ...error }, undefined, 2), { status });
    }

    this.gLogger.error(error);

    return new Response(JSON.stringify({ ...(error?.cause ?? _internalError.cause!) }, undefined, 2), { status });
  }
}
```

### Creating a Custom Error Handler

You can create a custom error handler by extending the `ErrorHandlerProvider` class and implementing the `handleError` method:

```typescript
import { ErrorHandlerProvider } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { Inject } from '@vercube/di';

export class CustomErrorHandlerProvider extends ErrorHandlerProvider {
  @Inject(Logger)
  private gLogger: Logger;

  public handleError(error: Error): Response {
    // Log the error
    this.gLogger.error('Custom error handler:', error);

    // Determine the status code
    const status = (error as any)?.status ?? 500;

    // Create a custom error response
    const errorResponse = {
      error: {
        message: error.message || 'An unexpected error occurred',
        code: status,
        timestamp: new Date().toISOString(),
        path: (error as any)?.path || 'unknown',
      },
    };

    // Return the response
    return new Response(JSON.stringify(errorResponse, undefined, 2), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
```

### Registering a Custom Error Handler

To use your custom error handler, you need to register it in the dependency injection container:

```typescript
import { createContainer } from '@vercube/core';
import { CustomErrorHandlerProvider } from './CustomErrorHandlerProvider';
import { ErrorHandlerProvider } from '@vercube/core';

// Create the container
const container = createContainer(config);

// Override the default error handler
container.bind(ErrorHandlerProvider, CustomErrorHandlerProvider);
```

## HTTP Error Classes

Vercube provides a set of predefined HTTP error classes that extend the base `HttpError` class. These classes represent common HTTP error scenarios and include the appropriate status codes.

### Base HTTP Error

The `HttpError` class is the base class for all HTTP errors in Vercube:

```typescript
export class HttpError extends Error {
  public status!: number;

  constructor(status: number, message?: string) {
    super();
    Object.setPrototypeOf(this, HttpError.prototype);

    if (status) {
      this.status = status;
    }

    if (message) {
      this.message = message;
    }

    this.stack = new Error().stack;
  }
}
```

### Available HTTP Error Classes

Vercube includes the following HTTP error classes:

| Error Class | Status Code | Description |
|-------------|-------------|-------------|
| `BadRequestError` | 400 | The server cannot process the request due to a client error |
| `UnauthorizedError` | 401 | The request requires authentication |
| `ForbiddenError` | 403 | The server understood the request but refuses to authorize it |
| `NotFoundError` | 404 | The requested resource could not be found |
| `MethodNotAllowedError` | 405 | The method specified in the request is not allowed for the resource |
| `NotAcceptableError` | 406 | The server cannot produce a response matching the list of acceptable values defined in the request's proactive content negotiation headers |
| `InternalServerError` | 500 | The server encountered an unexpected condition that prevented it from fulfilling the request |

### Using HTTP Error Classes

You can use these error classes in your controllers and middleware to throw appropriate HTTP errors:

```typescript
import { Controller, Get, Post, Body } from '@vercube/core';
import { NotFoundError, BadRequestError } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Get('/:id')
  async getUser(id: string) {
    const user = await this.userService.findById(id);
    
    if (!user) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }
    
    return user;
  }

  @Post('/')
  async createUser(@Body() userData: any) {
    if (!userData.name || !userData.email) {
      throw new BadRequestError('Name and email are required');
    }
    
    return this.userService.create(userData);
  }
}
```

## Error Handling Flow

The error handling flow in Vercube follows these steps:

1. An error is thrown in a controller, middleware, or service
2. The error is caught by the `RequestHandler` service
3. The `RequestHandler` passes the error to the `ErrorHandlerProvider`
4. The `ErrorHandlerProvider` processes the error and returns an appropriate HTTP response
5. The response is sent to the client

### Error Handling in Middleware

Middleware can also throw errors, which are caught and processed by the error handling system:

```typescript
import { BaseMiddleware } from '@vercube/core';
import { UnauthorizedError } from '@vercube/core';
import type { MiddlewareOptions } from '@vercube/core';

export class AuthMiddleware extends BaseMiddleware {
  public async onRequest(request: Request, response: Response, args: MiddlewareOptions): Promise<void> {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }
    
    // Validate the token
    const token = authHeader.substring(7);
    // ... token validation logic
  }
}
```

## Best Practices

1. **Use Appropriate Error Classes**: Use the most specific HTTP error class for each error scenario
2. **Include Helpful Error Messages**: Provide clear and helpful error messages to assist clients in resolving issues
3. **Log Errors Appropriately**: Use the Logger service to log errors with appropriate severity levels
4. **Handle Errors at the Right Level**: Handle errors at the appropriate level in your application (controller, service, etc.)
5. **Create Custom Error Classes**: For application-specific errors, create custom error classes that extend `HttpError`

## Conclusion

Error handling in Vercube provides a robust and flexible system for managing errors in your application. By using the built-in HTTP error classes and creating custom error handlers when needed, you can ensure that your application handles errors consistently and provides helpful information to clients.
