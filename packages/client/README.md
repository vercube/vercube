<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/client

### Call your Vercube API with the types of your controllers

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fclient?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fclient>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**A typed `fetch` client whose types come straight from your controller methods. Change a handler and every call site that no longer fits stops compiling.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Inferred, not generated** - the route map only points at your controllers; parameter and return types come from the compiler
- **Tiny** - about 1.5 kB min+gzip, no dependencies, runs in browsers, workers, Node, Bun and Deno
- **Every body** - JSON by default, multipart forms, `Blob` and stream bodies passed through
- **Server-Sent Events** - `@Sse()` routes resolve to a typed async iterable that honours `AbortSignal`
- **Errors that carry the response** - any non-2xx status throws a `VercubeClientError` with the parsed body
- **Typed errors** - errors declared with `@Throws()` come back from `api.safe.get()` as a union you can `switch` on by status

## 📦 Installation

```bash
pnpm add @vercube/client
```

## 📖 Usage

The route map tells the client which routes exist. `vercube typegen` and `vercube build` write it to `.vercube/routes.d.ts` from the routes the application registers; it can also be written by hand:

```ts
// .vercube/routes.d.ts
import type { EventsController } from '../src/Controllers/EventsController.js';
import type { UserController } from '../src/Controllers/UserController.js';
import type { RouteDef } from '@vercube/client';

export interface VercubeRoutes {
  'GET /users/:id': RouteDef<UserController, 'getUser', { param: { id: 0 } }>;
  'POST /users': RouteDef<UserController, 'create', { body: 0 }>;
  'GET /events/ticks': RouteDef<EventsController, 'ticks', { sse: true }>;
}
```

```ts
import { createClient } from '@vercube/client';
import type { VercubeRoutes } from './.vercube/routes.js';

const api = createClient<VercubeRoutes>({ baseURL: 'http://localhost:3000' });

const user = await api.get('/users/:id', { params: { id: '42' } });
await api.post('/users', { body: { name: 'Oskar' } });

for await (const event of await api.get('/events/ticks')) {
  console.log(event.event, event.data);
}
```

Check out the full [documentation](https://vercube.dev/docs/modules/client)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
