# Routing and Controllers

Routing in Vercube is a powerful and flexible system that allows you to define API endpoints using decorators. This guide explains how routing works in the framework and how to use it effectively.

## Overview

The routing system in Vercube is built on a decorator-based approach, where:

1. The `@Controller` decorator defines a base path for a group of related endpoints
2. HTTP method decorators (`@Get`, `@Post`, etc.) define specific routes within that controller
3. The framework automatically registers these routes and handles incoming requests

## Controller Decorator

The `@Controller` decorator is used to define a controller class and its base path. It sets up the foundation for all routes defined within that controller.

```typescript
import { Controller } from '@vercube/core';

@Controller('/users')
export class UserController {
  // Route handlers will be defined here
}
```

In this example, all routes defined in the `UserController` will be prefixed with `/users`.

## HTTP Method Decorators

Vercube provides decorators for all standard HTTP methods:

- `@Get(path)` - Handle GET requests
- `@Post(path)` - Handle POST requests
- `@Put(path)` - Handle PUT requests
- `@Delete(path)` - Handle DELETE requests
- `@Patch(path)` - Handle PATCH requests
- `@Options(path)` - Handle OPTIONS requests
- `@Head(path)` - Handle HEAD requests
- `@Connect(path)` - Handle CONNECT requests
- `@Trace(path)` - Handle TRACE requests

Each decorator takes a path parameter that defines the route relative to the controller's base path.

```typescript
import { Controller, Get, Post, Put, Delete } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Get('/')
  async getAllUsers() {
    // Handle GET /users
  }

  @Get('/:id')
  async getUserById() {
    // Handle GET /users/:id
  }

  @Post('/')
  async createUser() {
    // Handle POST /users
  }

  @Put('/:id')
  async updateUser() {
    // Handle PUT /users/:id
  }

  @Delete('/:id')
  async deleteUser() {
    // Handle DELETE /users/:id
  }
}
```

## Route Parameters

You can define route parameters using the `:paramName` syntax. These parameters can be accessed in your route handlers using parameter decorators.

```typescript
import { Controller, Get, Param } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Get('/:id')
  async getUserById(@Param('id') id: string) {
    // Access the 'id' parameter from the URL
    return `User with ID: ${id}`;
  }
}
```

## Request Body

To access the request body in POST, PUT, or PATCH requests, use the `@Body` decorator:

```typescript
import { Controller, Post, Body } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Post('/')
  async createUser(@Body() userData: any) {
    // Access the request body
    return `Created user: ${JSON.stringify(userData)}`;
  }
}
```

## Query Parameters

To access query parameters, use the `@QueryParam` or `@QueryParams` decorators:

```typescript
import { Controller, Get, QueryParam, QueryParams } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Get('/search')
  async searchUsers(
    @QueryParam('name') name: string,
    @QueryParams() allParams: Record<string, string>
  ) {
    // Access specific query parameter
    console.log(`Searching for users with name: ${name}`);
    
    // Access all query parameters
    console.log('All query parameters:', allParams);
    
    return `Search results for: ${name}`;
  }
}
```

## Headers

To access request headers, use the `@Header` or `@Headers` decorators:

```typescript
import { Controller, Get, Header, Headers } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Get('/')
  async getUsers(
    @Header('Authorization') authToken: string,
    @Headers() allHeaders: Record<string, string>
  ) {
    // Access specific header
    console.log(`Auth token: ${authToken}`);
    
    // Access all headers
    console.log('All headers:', allHeaders);
    
    return 'User list';
  }
}
```

## Middleware

You can apply middleware to controllers or specific routes using the `@Middleware` decorator:

```typescript
import { Controller, Get, Middleware } from '@vercube/core';
import { AuthMiddleware, LoggingMiddleware } from './middlewares';

// Apply middleware to all routes in the controller
@Controller('/users')
@Middleware(AuthMiddleware)
export class UserController {
  // Apply middleware to a specific route
  @Get('/')
  @Middleware(LoggingMiddleware, { priority: 1 })
  async getAllUsers() {
    return 'User list';
  }
}
```

## Request and Response Objects

You can access the raw request and response objects using the `@Request` and `@Response` decorators:

```typescript
import { Controller, Get, Request, Response } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Get('/')
  async getAllUsers(
    @Request() req: Request,
    @Response() res: Response
  ) {
    // Access the raw request and response objects
    console.log('Request URL:', req.url);
    
    // Modify the response
    res.headers.set('X-Custom-Header', 'value');
    
    return 'User list';
  }
}
```

## How It Works

Behind the scenes, the routing system:

1. Uses the `Controller` decorator to set up metadata for the controller class, including its base path
2. Uses HTTP method decorators to register routes with the Router service
3. The Router service matches incoming requests to the appropriate route
4. The RequestHandler service processes the request through middleware and executes the route handler
5. The MetadataResolver service resolves parameters, body, query parameters, and headers

This architecture provides a clean, declarative way to define API endpoints while maintaining flexibility and power.

## Best Practices

1. **Organize by Resource**: Group related endpoints in the same controller
2. **Use Meaningful Paths**: Choose paths that clearly indicate the resource and action
3. **Leverage Middleware**: Use middleware for cross-cutting concerns like authentication and logging
4. **Validate Input**: Use validation decorators to ensure input data is valid
5. **Handle Errors**: Implement proper error handling for all routes

## Conclusion

The routing system in Vercube provides a powerful and intuitive way to define API endpoints. By using decorators, you can create clean, maintainable, and well-organized code that clearly expresses the structure of your API.
