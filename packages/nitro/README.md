# @vercube/nitro

Nitro integration for the [Vercube](https://github.com/vercube/vercube) framework. This package wires up Vercube's decorator-based controllers, services and middleware into a [Nitro](https://nitro.unjs.io/) server module, so you can use the full Vercube DI/decorator system without any extra glue code.

## Installation

```bash
pnpm add @vercube/nitro
```

## Usage

Add the plugin to your `nitro.config.ts`:

```ts
import { vercubeNitro } from '@vercube/nitro';

export default defineNitroConfig({
  modules: [
    vercubeNitro({
      // optional path to a boot file that runs before the app starts
      setupFile: './src/boot/boot.ts',
    }),
  ],
});
```

### Boot file

The `setupFile` is a regular TypeScript module that exports a default function. It receives the Vercube `App` instance and is the right place to configure your DI container, register providers, or run any startup logic.

```ts
// src/boot/boot.ts
import type { App } from '@vercube/core';

export default async function boot(app: App) {
  // configure the app here
}
```

### Controllers

Annotate your classes with `@Controller` and HTTP method decorators. The plugin discovers them automatically at build time.

```ts
import { Controller, Get, Post } from '@vercube/core';

@Controller('/users')
export class UserController {
  @Get('/')
  list() {
    return [{ id: 1, name: 'Alice' }];
  }

  @Post('/')
  create() {
    return { id: 2, name: 'Bob' };
  }
}
```

Place your controllers in the `api/` or `routes/` directory (configurable via `nitro.config.ts` options `apiDir` / `routesDir`).

### Services

Services decorated with `@Injectable` are discovered and registered in the DI container automatically. Place them anywhere inside the directories listed in `scanDirs`.

```ts
import { Injectable } from '@vercube/di';

@Injectable()
export class UserService {
  findAll() {
    return [];
  }
}
```

### Middleware

Classes that extend `BaseMiddleware` are picked up and registered automatically.

```ts
import { BaseMiddleware } from '@vercube/core';

export class AuthMiddleware extends BaseMiddleware {
  async onRequest(event: any) {
    // validate token, etc.
  }
}
```

### Storage

`@vercube/nitro` ships a `NitroStorageManager` that wraps Nitro's built-in storage layer. Configure your storage drivers in `nitro.config.ts` under `storage`, then inject `StorageManager` in your services as usual.

```ts
// nitro.config.ts
export default defineNitroConfig({
  storage: {
    cache: { driver: 'memory' },
  },
});
```

## Options

| Option      | Type       | Default | Description                                           |
| ----------- | ---------- | ------- | ----------------------------------------------------- |
| `setupFile` | `string`   | -       | Path to the boot file executed before the app starts  |
| `scanDirs`  | `string[]` | `[]`    | Extra directories to scan for services and middleware |

## License

MIT
