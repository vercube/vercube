# @vercube/scan

Shared source-scanning and AST-extraction utilities for the [Vercube](https://github.com/vercube/vercube) framework. It discovers `@Controller` routes, `@Injectable` services and `BaseMiddleware` subclasses by parsing TypeScript/JavaScript with [`oxc-parser`](https://www.npmjs.com/package/oxc-parser).

This package is the single source of truth used by both the [`@vercube/nitro`](../nitro) and [`@vercube/vite`](../vite) integrations. You usually don't depend on it directly.

## Installation

```bash
pnpm add @vercube/scan
```

## API

### Pure extractors

Operate on a source string and return discovered classes (with placeholder import specifiers):

```ts
import { extractRoutes, extractServices, extractMiddlewares } from '@vercube/scan';

extractRoutes(code); // RouteInfo[]
extractServices(code); // ServiceInfo[]
extractMiddlewares(code); // MiddlewareInfo[]
```

### Scanning

`scanFiles` / `scanDir` walk directories (via [`tinyglobby`](https://www.npmjs.com/package/tinyglobby)); the higher-level helpers read files, extract, and resolve each import to its real path:

```ts
import { getRoutes, getServices, getMiddlewares, scanProject, scanSource } from '@vercube/scan';

// Nitro-style: dedicated api/routes/services subdirectories
await scanProject({ baseDirs: ['/abs/src'] });

// Vercube-style: walk the whole tree, classes can live anywhere
await scanSource({ dirs: ['/abs/src'] });
// → { routes, services, middlewares } with imports resolved to real paths
```

`scanSource` reads each file once and applies all three extractors, deduplicating services that are already registered as routes.

## License

MIT
