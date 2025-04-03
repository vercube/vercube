# Middleware

Middleware in Vercube is a powerful mechanism for processing requests and responses before they reach your route handlers or after they leave them. This guide explains how middleware works in the framework and how to use it effectively.

## Overview

Middleware in Vercube follows a request-response lifecycle pattern:

1. **Before Middleware**: Executes before the route handler, allowing you to modify the request or short-circuit the request if needed
2. **Route Handler**: The main handler for the route
3. **After Middleware**: Executes after the route handler, allowing you to modify the response

Middleware can be applied at different levels:
- **Global Middleware**: Applied to all routes in the application
- **Controller Middleware**: Applied to all routes in a specific controller
- **Route Middleware**: Applied to a specific route

## Middleware Lifecycle

The middleware lifecycle in Vercube follows these steps:

1. When a request comes in, the Router service matches it to the appropriate route
2. The RequestHandler service prepares the route handler and its associated middleware
3. Before middlewares are executed in order of priority (lower numbers first)
4. The route handler is executed
5. After middlewares are executed in order of priority (lower numbers first)
6. The final response is returned to the client

## Creating Middleware

Middleware in Vercube is implemented as a class that extends the `BaseMiddleware` class. The `BaseMiddleware` class provides two optional methods that you can override:

- `onRequest`: Called before the route handler
- `onResponse`: Called after the route handler

Here's an example of a simple logging middleware:

```typescript
import { BaseMiddleware } from '@vercube/core';
import type { MiddlewareOptions } from '@vercube/core';

export class LoggingMiddleware extends BaseMiddleware {
  public async onRequest(request: Request, response: Response, args: MiddlewareOptions): Promise<void> {
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
  }

  public async onResponse(request: Request, response: Response, payload: any): Promise<void> {
    console.log(`[${new Date().toISOString()}] Response sent for ${request.method} ${request.url}`);
  }
}
```

## Applying Middleware

### Using the @Middleware Decorator

The `@Middleware` decorator is used to apply middleware to controllers or specific routes:

```typescript
import { Controller, Get, Middleware } from '@vercube/core';
import { LoggingMiddleware, AuthMiddleware } from './middlewares';

// Apply middleware to all routes in the controller
@Controller('/users')
@Middleware(LoggingMiddleware)
export class UserController {
  // Apply middleware to a specific route
  @Get('/')
  @Middleware(AuthMiddleware, { priority: 1 })
  async getAllUsers() {
    return 'User list';
  }
}
```

The `priority` option determines the order in which middleware is executed. Lower numbers have higher priority and are executed first.

### Global Middleware

Global middleware is applied to all routes in the application. You can register global middleware using the `GlobalMiddlewareRegistry` service:

```typescript
import { GlobalMiddlewareRegistry } from '@vercube/core';
import { LoggingMiddleware } from './middlewares';

// In your application setup
const globalMiddlewareRegistry = container.get(GlobalMiddlewareRegistry);
globalMiddlewareRegistry.registerGlobalMiddleware(LoggingMiddleware);
```

## Built-in Middleware

Vercube includes several built-in middleware implementations:

### ValidationMiddleware

The `ValidationMiddleware` is used to validate request data against a schema. It's automatically applied when you use validation with the `@Body`, `@QueryParam`, or `@QueryParams` decorators.

```typescript
import { Controller, Post, Body } from '@vercube/core';
import { z } from 'zod'; // Example validation library

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  age: z.number().min(18),
});

@Controller('/users')
export class UserController {
  @Post('/')
  async createUser(@Body(userSchema) userData: any) {
    // The request body is already validated against the schema
    return `Created user: ${JSON.stringify(userData)}`;
  }
}
```

## Middleware Options

Middleware can receive options through the `args` parameter in the `onRequest` and `onResponse` methods:

```typescript
import { BaseMiddleware } from '@vercube/core';
import type { MiddlewareOptions } from '@vercube/core';

interface MyMiddlewareOptions {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class MyMiddleware extends BaseMiddleware<MyMiddlewareOptions> {
  public async onRequest(request: Request, response: Response, args: MiddlewareOptions<MyMiddlewareOptions>): Promise<void> {
    const logLevel = args.middlewareArgs?.logLevel ?? 'info';
    console.log(`[${logLevel}] ${request.method} ${request.url}`);
  }
}

// Using the middleware with options
@Controller('/users')
@Middleware(MyMiddleware, { logLevel: 'debug' })
export class UserController {
  // ...
}
```

## Middleware Response Handling

Middleware can modify the response in two ways:

1. **Modify the response object**: Middleware can modify the response object directly
2. **Return a new response**: Middleware can return a new `Response` object to replace the current response

Here's an example of middleware that adds a custom header to the response:

```typescript
import { BaseMiddleware } from '@vercube/core';
import type { MiddlewareOptions } from '@vercube/core';

export class AddHeaderMiddleware extends BaseMiddleware {
  public async onResponse(request: Request, response: Response, payload: any): Promise<void> {
    response.headers.set('X-Custom-Header', 'value');
  }
}
```

And here's an example of middleware that returns a new response:

```typescript
import { BaseMiddleware } from '@vercube/core';
import type { MiddlewareOptions } from '@vercube/core';

export class CacheMiddleware extends BaseMiddleware {
  public async onResponse(request: Request, response: Response, payload: any): Promise<Response> {
    // Create a new response with caching headers
    return new Response(JSON.stringify(payload), {
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}
```

## Error Handling in Middleware

Middleware can throw errors to short-circuit the request. These errors are caught by the `ErrorHandlerProvider` service and converted to appropriate HTTP responses.

```typescript
import { BaseMiddleware } from '@vercube/core';
import type { MiddlewareOptions } from '@vercube/core';
import { UnauthorizedError } from '@vercube/core';

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

1. **Keep Middleware Focused**: Each middleware should do one thing and do it well
2. **Use Priority Appropriately**: Set appropriate priorities for your middleware to ensure they execute in the correct order
3. **Handle Errors Properly**: Throw appropriate errors from middleware to ensure they're handled correctly
4. **Avoid Side Effects**: Middleware should avoid side effects that could affect other parts of the application
5. **Use Global Middleware Sparingly**: Global middleware affects all routes, so use it only for truly global concerns

## Conclusion

Middleware in Vercube provides a powerful and flexible way to process requests and responses. By using middleware effectively, you can implement cross-cutting concerns like authentication, logging, validation, and caching in a clean and maintainable way.
