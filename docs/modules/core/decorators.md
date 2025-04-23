# Decorators

This document provides comprehensive documentation for the decorators available in the Vercube Core module. Decorators are used to add metadata and behavior to classes and methods.

## Table of Contents

- [HTTP Decorators](#http-decorators)
  - [Route Decorators](#route-decorators)
  - [Parameter Decorators](#parameter-decorators)
  - [Response Decorators](#response-decorators)
- [Hooks Decorators](#hooks-decorators)

## HTTP Decorators

### Route Decorators

Route decorators are used to define HTTP endpoints in your application. They register routes with the Router service and set up request handlers.

#### @Controller

```typescript
@Controller(path: string)
```

Defines a controller class with a base path. This decorator initializes metadata for the controller and sets the base path for all routes within the controller.

Example:
```typescript
@Controller('/api/users')
class UserController {
  // Route handlers
}
```

#### HTTP Method Decorators

The following decorators define HTTP method handlers:

- `@Get(path: string)`
- `@Post(path: string)`
- `@Put(path: string)`
- `@Delete(path: string)`
- `@Patch(path: string)`
- `@Head(path: string)`
- `@Options(path: string)`
- `@Connect(path: string)`
- `@Trace(path: string)`

Each decorator:
- Registers a route with the specified path and HTTP method
- Sets up a request handler using the RequestHandler service
- Resolves the full URL path using the MetadataResolver

Example:
```typescript
@Controller('/api/users')
class UserController {
  @Get('/:id')
  async getUser(@Param('id') id: string) {
    // Handle GET request
  }

  @Post('/')
  async createUser(@Body() user: User) {
    // Handle POST request
  }
}
```

### Parameter Decorators

Parameter decorators are used to extract and validate data from HTTP requests.

#### @Body

```typescript
@Body(options?: { validationSchema?: ValidationTypes.Schema })
```

Extracts and validates the request body. Optionally accepts a validation schema.

Example:
```typescript
@Post('/')
async createUser(@Body({ validationSchema: userSchema }) user: User) {
  // Handle validated user data
}
```

#### @Param

```typescript
@Param(name: string)
```

Extracts a route parameter by name.

Example:
```typescript
@Get('/:id')
async getUser(@Param('id') id: string) {
  // Handle user ID from route parameter
}
```

#### @QueryParam

```typescript
@QueryParam(options: { name: string, validationSchema?: ValidationTypes.Schema })
```

Extracts and validates a query parameter. Optionally accepts a validation schema.

Example:
```typescript
@Get('/')
async searchUsers(@QueryParam({ name: 'q', validationSchema: searchSchema }) query: string) {
  // Handle search query
}
```

#### @Header

```typescript
@Header(name: string)
```

Extracts an HTTP header by name.

Example:
```typescript
@Get('/')
async getWithAuth(@Header('Authorization') token: string) {
  // Handle authorization header
}
```

### Response Decorators

Response decorators modify the HTTP response.

#### @Status

```typescript
@Status(code: HTTPStatus)
```

Sets the HTTP status code for the response.

Example:
```typescript
@Post('/')
@Status(201)
async createUser(@Body() user: User) {
  // Return 201 Created
}
```

#### @SetHeader

```typescript
@SetHeader(key: string, value: string)
```

Sets an HTTP header on the response.

Example:
```typescript
@Get('/')
@SetHeader('Cache-Control', 'no-cache')
async getData() {
  // Return response with cache control header
}
```

The `@Listen` decorator:
- Registers the method as a listener for the specified hook type
- Automatically calls the method when the hook is triggered
- Handles cleanup by unregistering the listener when the decorator is destroyed