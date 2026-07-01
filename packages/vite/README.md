# @vercube/vite

Run a [Vercube](https://github.com/vercube/vercube) server as a [Vite](https://vite.dev) plugin, built on Vite's [Environment API](https://vite.dev/guide/api-environment.html). Your decorator-based controllers run inside an isolated dev worker with fast server-side HMR, and `vite build` produces a runnable server bundle, all with zero-config controller discovery.

> **Experimental.** This integration is in an early stage and its API may change between releases.

## Installation

```bash
pnpm add -D @vercube/vite vite
```

`experimentalDecorators` must be enabled in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": false
  }
}
```

## Usage

Add the plugin to your `vite.config.ts`:

```ts
import { vercube } from '@vercube/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vercube()],
});
```

Place a `@Controller` anywhere under `src/`. It is discovered automatically, with no manual registration:

```ts
// src/Controllers/HelloController.ts
import { Controller, Get, Param } from '@vercube/core';

@Controller('/api/hello')
export default class HelloController {
  @Get('/')
  index() {
    return { message: 'Hello from Vercube + Vite!' };
  }

  @Get('/:name')
  greet(@Param('name') name: string) {
    return { message: `Hello, ${name}!` };
  }
}
```

Then:

```bash
vite          # dev server with HMR
vite build    # bundles to dist/index.mjs
node dist/index.mjs   # runs the built server
```

## How it works

- A dedicated Vite **environment** (`vercube`) runs the server. In dev it executes inside an isolated [`env-runner`](https://www.npmjs.com/package/env-runner) worker via Vite's `ModuleRunner`.
- Controllers and `@Injectable` services are discovered by scanning your source tree (AST parsing via [`@vercube/scan`](../scan)) and assembled into a generated entry that creates the app, binds the classes, and exports `fetch`.
- Vercube only claims **the routes you actually define**. Requests matching a discovered route are handed to the worker, everything else falls through to Vite. So the plugin sits next to a frontend (Vue, React, plain JS) that Vite serves on the same server. See [`examples/vite`](../../examples/vite) for a Vite + Vue app calling a Vercube API.
- Editing or adding controllers triggers a worker reload, so changes are live without a manual restart.

`vite build` builds your frontend (if any) and then bundles the Vercube server to `dist/index.mjs`.

## Options

| Option       | Type                   | Default         | Description                                                                                                       |
| ------------ | ---------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `rootDir`    | `string`               | Vite `root`     | Project root used to resolve `scanDirs` and `setupFile`.                                                          |
| `scanDirs`   | `string[]`             | `['src']`       | Directories scanned (recursively) for `@Controller` and `@Injectable` classes.                                    |
| `setupFile`  | `string`               | `undefined`     | Module whose default export `(app: App) => void \| Promise<void>` runs as `createApp`'s setup hook (before init). |
| `runner`     | `string`               | `'node-worker'` | The `env-runner` runner used to execute server code in dev.                                                       |
| `noExternal` | `(string \| RegExp)[]` | `undefined`     | Extra package patterns merged after `@vercube/*` for dev and production bundling (see below).                     |

### `noExternal`

Vercube keeps `@vercube/*` in a single module graph so class-reference DI tokens are not loaded twice. If a dependency imports `@vercube/core` from its published `dist` while your app resolves a different copy (common with pnpm), inject tokens such as `RequestContext` will not match — auth middleware writes to one instance, your services read from another.

The same patterns apply in **dev** (`resolve.noExternal`). In **production** the server bundle keeps `@vercube/*` and plugin packages as runtime imports — only app source (`@/…`) is inlined. Use **one** `@vercube/core` version across the app and dependencies (e.g. pnpm `overrides`), otherwise class-reference DI tokens such as `RequestContext` will not match between `@enp/auth` and your services.

Add packages that use Vercube DI tokens:

```ts
vercube({
  noExternal: [/^@enp\//],
});
```

## Setup file

Auto-discovery binds `@Controller` and `@Injectable` classes. Anything it can't infer, such as registering plugins, mounting storage, or binding an interface to an implementation, goes in a `setupFile`. It runs as `createApp`'s `setup` hook, **before** the app initializes, so it is early enough to register plugins:

```ts
import { vercube } from '@vercube/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vercube({ setupFile: './src/Boot/Setup.ts' })],
});
```

```ts
// src/Boot/Setup.ts
import type { App } from '@vercube/core';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';

export default async function setup(app: App) {
  app.container.bind(StorageManager);
  app.container.get(StorageManager).mount({ storage: MemoryStorage });
}
```

## WebSockets

The `@vercube/ws` plugin works in both the dev server and the production build. Register it from your `setupFile` (`app.addPlugin(WebsocketPlugin)`) and define WebSocket controllers as usual (`@Controller` + `@Namespace`). They are auto-discovered. The dev server forwards upgrade handshakes into the worker, and the production server handles them natively through `srvx`.

## License

MIT
