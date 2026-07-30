<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/devtools

### A local-first inspector for Vercube applications

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fdevtools?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fdevtools>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Local-first inspector for Vercube applications** — dependency graph, routes, request waterfalls, bootstrap profiler and audits, served by the app itself.

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Container graph** - bindings and `@Inject` edges, with cycle detection. Inspection never instantiates services.
- **Route explorer** - route table grouped by controller, with middleware chains and argument decorators.
- **Request inspector** - live span-by-span waterfall per request (middleware, handler, framework overhead).
- **Bootstrap profiler** - flamegraph of container construction with self-time hotspots.
- **Audit** - circular deps, unbound injections, duplicate routes, unvalidated input, slow constructors and failing endpoints, scored 0-100.
- **Snapshot export** - one JSON file with everything.
- **Single self-contained page** - one inlined HTML document served from your app.
- **Off in production** - enabled only in development unless you opt in; can be locked behind a token.

## 📦 Installation

```bash
pnpm add -D @vercube/devtools
```

## 📖 Usage

Register the plugin in `vercube.config.ts` so the bootstrap profiler is installed
before the DI container is created:

```ts
import { defineConfig } from '@vercube/core';
import { DevtoolsPlugin } from '@vercube/devtools';

export default defineConfig({
  plugins: [DevtoolsPlugin],
});
```

Start your app and open [http://localhost:3000/_devtools](http://localhost:3000/_devtools).

`app.addPlugin(DevtoolsPlugin)` works too, but attaches after the container has
been built, so the bootstrap profile is only partial.

### Options

```ts
import { withPluginOptions } from '@vercube/core';
import { DevtoolsPlugin } from '@vercube/devtools';

export default defineConfig({
  plugins: [
    withPluginOptions(DevtoolsPlugin, {
      path: '/__inspect',
      token: process.env.DEVTOOLS_TOKEN,
      maxRequests: 500,
    }),
  ],
});
```

| Option           | Default        | Description                                                         |
| ---------------- | -------------- | ------------------------------------------------------------------- |
| `enabled`        | `config.dev`   | Master switch. Off in production unless explicitly enabled. |
| `path`           | `'/_devtools'` | Where the UI and its API are mounted.                       |
| `token`          | `null`         | Required as `?token=` or `x-devtools-token` when set.       |
| `maxRequests`    | `250`          | Size of the in-memory request ring buffer.                  |
| `trackRequests`  | `true`         | Record per-request timelines.                               |
| `captureHeaders` | `true`         | Capture request/response headers (credentials are redacted). |
| `redactHeaders`  | `[]`           | Extra header names to redact on top of the built-in list.   |

### HTTP API

Everything the UI shows is plain JSON:

| Endpoint                | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `GET /api/overview`     | Application identity, counts, memory, traffic stats |
| `GET /api/graph`        | DI nodes, edges and detected cycles                 |
| `GET /api/routes`       | Route table with middlewares and arguments          |
| `GET /api/requests`     | Recorded requests (newest first)                    |
| `GET /api/requests/:id` | A single recorded request                           |
| `GET /api/bootstrap`    | Bootstrap call tree and hotspots                    |
| `GET /api/audit`        | Audit findings and health score                     |
| `GET /api/route`        | Which route handles `?method=&path=`                |
| `GET /api/snapshot`     | Everything above, as a downloadable file            |
| `GET /api/stream`       | Server-sent events, one per recorded request        |
| `DELETE /api/requests`  | Clear the request buffer                            |

## 🔒 Security

Devtools expose the internal structure of your application. They are disabled
unless the app runs in development mode; turning them on elsewhere requires
`enabled: true`, and you should set a `token` when you do. Credential-bearing
headers (`authorization`, `cookie`, API keys) are always replaced with
`<redacted>`.

The endpoints are ordinary `@Controller` routes, but the plugin detaches your
application's **global** middlewares from them. Use the `token` option for access
control instead.

Check out the full [documentation](https://vercube.dev/docs/modules/devtools/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
