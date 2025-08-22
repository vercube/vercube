<div align="center">
  <a href="https://vercube.dev/"><img src="https://github.com/OskarLebuda/vue-lazy-hydration/raw/main/.github/assets/logo.png?raw=true" alt="Vite logo" width="200"></a>
  <br>
  <br>

# Vercube

Next generation HTTP framework

  <a href="https://www.npmjs.com/package/@vercube/schema">
    <img src="https://img.shields.io/npm/v/%40vercube%2Fschema?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://www.npmjs.com/package/@vercube/schema">
    <img src="https://img.shields.io/npm/dm/%40vercube%2Fschema?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://github.com/vercube/vercube/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/npm/l/%40vercube%2Fschema?style=for-the-badge&color=%23767eff" alt="License"/>
  </a>
  <a href="https://codecov.io/gh/vercube/vercube" target="_blank">
    <img src="https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&color=%23767eff" alt="Coverage"/>
  </a>
  <br/>
  <br/>
</div>

An ultra-efficient JavaScript server framework that runs anywhere - Node.js, Bun, or Deno - with unmatched flexibility and complete configurability for developers who refuse to sacrifice speed or control.

---

## 🧩 `@vercube/schema` Module

The `@vercube/schema` module provides a unified, provider-agnostic interface for managing OpenAPI schemas.  
It abstracts schema definitions into a consistent API that works across tools and environments, enabling easy switching between providers without modifying your application code.

### ✅ Key Features

- Seamless integration with OpenAPI
- Zod-based schema definition
- Works out-of-the-box with route decorators
- Compatible with custom validation and metadata
- Supports both static and runtime schema generation

---

## 🚀 Installation

```bash
pnpm install @vercube/schema
```

---

## ⚙️ Usage

Integrate the Schema plugin into your app setup:

```ts
import { createApp } from '@vercube/core';
import { SchemaPlugin } from '@vercube/schema';

const app = createApp({
  setup: async (app) => {
    app.addPlugin(SchemaPlugin);
  },
});
```

---

## 🧵 Route Schema Decorators

The `@Schema` decorator lets you define OpenAPI-compatible schema definitions directly on your routes.
It leverages [`@asteasolutions/zod-to-openapi`](https://github.com/asteasolutions/zod-to-openapi) for automatic schema translation and also supports `.openapi` properties on Zod schemas.

```ts
import { Body, Controller, Post } from '@vercube/core';
import { Schema } from '@vercube/schema';

@Controller('/users')
export class UsersController {
  @Post('/')
  @Schema({
    request: {
      params: ParamsSchema,
    },
    responses: {
      200: {
        description: 'Retrieve the user',
        content: {
          'application/json': {
            schema: UserSchema,
          },
        },
      },
    },
  })
  public async insertUser(@Body({ validationSchema: UserSchema }) user: User): Promise<void> {
    console.log(user);
  }
}
```

## 📄 Runtime Access to OpenAPI Schema

When the SchemaPlugin is added to your application, a special controller is automatically registered.
This controller exposes the full OpenAPI schema at runtime and is available without any additional configuration.

You can access it at:

```
http://localhost:3000/_schema
```

This makes it easy to integrate with tools like Swagger UI, Postman, or for debugging and documentation purposes.

### ✨ Automatic Resolution

- The `@Schema` decorator automatically resolves:
  - HTTP method and route path
  - Request body schema (`@Body`)
  - Query parameters (`@QueryParams`)
  - Path parameters (`@Params`)

---

## 📚 Documentation

Full documentation is available at [**vercube.dev**](https://vercube.dev).
Explore guides, API references, and best practices to master Vercube.

---

## 🙌 Credits

This module is inspired by:

- [@asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi)
- [Hono Zod OpenAPI Example](https://hono.dev/examples/zod-openapi)
- [Nitro OpenAPI](https://nitro.build/config#openapi)

---

## 🪪 License

[MIT License](https://github.com/vercube/vercube/blob/main/LICENSE)
