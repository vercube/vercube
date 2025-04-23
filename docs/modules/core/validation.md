---
next: false
---
# Validation

Vercube integrates with the [Standard Schema](https://github.com/standard-schema/standard-schema) specification, allowing you to use any compatible schema validation library (such as Zod, Valibot, or ArkType) to validate data in your application.

## Overview

The validation system includes:

1. **Schema Integration** - Support for Standard Schema-compatible validation libraries
2. **Parameter Validation** - Validation of request parameters using schema validation
3. **Validation Errors** - Handling of validation errors

## Schema Integration

### Using Standard Schema Libraries

Vercube works with any library that implements the Standard Schema specification. This includes popular libraries like:

- [Zod](https://github.com/colinhacks/zod)
- [Valibot](https://github.com/fabian-hiller/valibot)
- [ArkType](https://github.com/arktypeio/arktype)

### Example with Zod

```typescript
import { z } from 'zod';
import { Controller, Post, Body } from '@vercube/core';

// Define schemas using Zod
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().min(0).max(150)
});

@Controller('/users')
class UserController {
  @Post('/')
  createUser(
    @Body({ validationSchema: userSchema }) body: z.infer<typeof userSchema>,
  ) {
    // Create a user with validated data
    return { message: 'User created successfully' };
  }
}
```

## Parameter Validation

### Request Body Validation

The `@Body` decorator can be used to validate request bodies using a Standard Schema-compatible schema:

```typescript
import { Controller, Post, Body } from '@vercube/core';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  age: z.number().int().min(0, 'Age must be a non-negative integer')
});

@Controller('/users')
class UserController {
  @Post('/')
  createUser(@Body({ validationSchema: userSchema }) body: z.infer<typeof userSchema>) {
    // The body is already validated and typed
    return { message: `User ${body.name} created successfully` };
  }
}
```

### Query Parameters Validation

The `@QueryParams` decorator can be used to validate query parameters using a Standard Schema-compatible schema:

```typescript
import { Controller, Get, QueryParams } from '@vercube/core';
import { z } from 'zod';

const queryParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  sort: z.enum(['asc', 'desc']).default('asc')
});

@Controller('/users')
class UserController {
  @Get('/')
  getUsers(@QueryParams({ validationSchema: queryParamsSchema }) query: z.infer<typeof queryParamsSchema>) {
    // The query parameters are already validated and typed
    return { 
      message: `Fetching users with page=${query.page}, limit=${query.limit}, sort=${query.sort}` 
    };
  }
}
```

### Path Parameters Validation

The `@Param` decorator can be used to validate path parameters using a Standard Schema-compatible schema:

```typescript
import { Controller, Get, Param } from '@vercube/core';
import { z } from 'zod';

const idSchema = z.string().uuid('Invalid user ID');

@Controller('/users')
class UserController {
  @Get('/:id')
  getUser(@Param('id', { validationSchema: idSchema }) id: string) {
    // The path parameter is already validated
    return { message: `Fetching user with ID: ${id}` };
  }
}
```

## Validation Errors

When validation fails, Vercube automatically returns a validation error response with the following structure:

```json
{
  "statusCode": 400,
  "message": "Validation Error",
  "errors": [
    {
      "path": "body.name",
      "message": "Name is required",
      "code": "invalid_type"
    },
    {
      "path": "body.email",
      "message": "Invalid email format",
      "code": "invalid_string"
    }
  ]
}
```