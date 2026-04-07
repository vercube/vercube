<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/evlog

### Structured wide-event logging for Vercube apps

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fevlog?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fevlog>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**[evlog](https://evlog.dev) integration for Vercube — structured wide-event logging with per-request context, tail sampling, and drain pipelines.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started) • [evlog docs](https://evlog.dev)

</div>

## ✨ Features

- **Wide-event logging** — one rich log per request instead of many sparse lines
- **Request-scoped logger** — access a per-request `log` via `RequestContext`
- **Tail sampling** — keep slow or failed requests regardless of sample rate
- **Drain pipeline** — ship events to any backend (Axiom, Loki, custom)
- **Zero changes to core** — opt-in via `EvlogPlugin`, no modifications to existing packages

## 📦 Installation

```bash
pnpm add @vercube/evlog
```

## 📖 Usage

### Basic setup

Register `EvlogPlugin` in your Vercube config to replace the default console logger with evlog:

```ts
import { defineConfig } from '@vercube/core';
import { EvlogPlugin } from '@vercube/evlog';

export default defineConfig({
  plugins: [
    [EvlogPlugin, {
      // exclude health-check routes from request logging
      exclude: ['/health'],
      // evlog provider options
      provider: {
        pretty: true, // pretty-print in dev
      },
    }],
  ],
});
```

### Shipping logs to an external backend

Use the `drain` option to forward every emitted wide-event to a logging backend:

```ts
import { defineConfig } from '@vercube/core';
import { EvlogPlugin } from '@vercube/evlog';

export default defineConfig({
  plugins: [
    [EvlogPlugin, {
      provider: {
        drain: async ({ event }) => {
          await fetch('https://api.axiom.co/v1/datasets/logs/ingest', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([event]),
          });
        },
      },
    }],
  ],
});
```

### Reading the request-scoped logger

Inside a controller or service, access the per-request logger via `RequestContext`:

```ts
import { Controller, Get } from '@vercube/core';
import { Inject } from '@vercube/di';
import { RequestContext } from '@vercube/core';
import { EVLOG_REQUEST_LOGGER_KEY } from '@vercube/evlog';
import type { EvlogTypes } from '@vercube/evlog';

@Controller('/users')
export class UsersController {
  @Inject(RequestContext)
  private requestContext!: RequestContext;

  @Get('/:id')
  async getUser() {
    const log = this.requestContext.get<EvlogTypes.EvlogRequestLogger>(EVLOG_REQUEST_LOGGER_KEY);
    log?.set('userId', 42);

    return { id: 42 };
  }
}
```

### Using the evlog API directly

The package re-exports the full evlog API:

```ts
import { log, initLogger, createMiddlewareLogger } from '@vercube/evlog';

// Standalone structured log
log.info({ service: 'payments', action: 'charge', amount: 100 });
log.error({ error: new Error('timeout'), requestId: '123' });
```

## 🔧 Plugin options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include` | `string[]` | all routes | Glob patterns for routes to log |
| `exclude` | `string[]` | `[]` | Glob patterns for routes to skip |
| `routes` | `Record<string, { service: string }>` | — | Per-route service name overrides |
| `priority` | `number` | `0` | Middleware priority (lower = earlier) |
| `provider` | `EvlogProviderOptions` | — | Options forwarded to `initLogger()` |
| `drain` | `function` | — | Drain callback for every emitted event |
| `enrich` | `function` | — | Enrich callback before drain |
| `keep` | `function` | — | Tail-sampling callback |

### `provider` options (`EvlogProviderOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable all logging |
| `pretty` | `boolean` | auto | Pretty-print output |
| `silent` | `boolean` | `false` | Suppress built-in console output |
| `stringify` | `boolean` | `true` | Emit JSON strings vs raw objects |
| `env` | `object` | — | Service, environment, version overrides |
| `sampling` | `object` | — | Per-level sample rates and keep rules |
| `drain` | `function` | — | Drain callback (alternative to plugin-level drain) |

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
