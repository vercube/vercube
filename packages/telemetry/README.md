<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/telemetry

### OpenTelemetry for Vercube apps

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Ftelemetry?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Ftelemetry>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Standards-first observability: every request becomes an OpenTelemetry span, W3C trace context flows in and out, and any OTLP backend works. Off in production until you opt in, and free when it is off.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **A span per request** - route template, controller, handler and the stable HTTP semantic conventions
- **W3C trace context** - `traceparent` read on the way in, injectable on the way out
- **One AsyncLocalStorage** - trace context rides in the request context Vercube already opens, not a second frame
- **API only by default** - `@opentelemetry/api` is the single dependency; the SDK, exporters and samplers are optional
- **Zero cost when off** - core sees a `null` check, and the allocation-free route fast path stays synchronous

## 📦 Installation

```bash
pnpm add @vercube/telemetry
```

Exporting to a collector additionally needs the OpenTelemetry SDK:

```bash
pnpm add @opentelemetry/sdk-trace-node @opentelemetry/resources @opentelemetry/exporter-trace-otlp-http
```

## 📖 Usage

```ts
// vercube.config.ts
import { defineConfig } from '@vercube/core';
import { TelemetryPlugin } from '@vercube/telemetry';

export default defineConfig({
  telemetry: true,
  plugins: [TelemetryPlugin],
});
```

```ts
// src/index.ts
import { startNodeTelemetry } from '@vercube/telemetry/sdk';

await startNodeTelemetry({
  serviceName: 'checkout',
  endpoint: 'http://localhost:4318',
});
```

Annotate your own work with the `Telemetry` token:

```ts
import { Inject } from '@vercube/di';
import { Telemetry } from '@vercube/telemetry';

class InvoiceService {
  @Inject(Telemetry)
  private gTelemetry!: Telemetry;

  public refund(id: string) {
    return this.gTelemetry.span('invoice.refund', (span) => {
      span.setAttribute('invoice.id', id);
      return this.process(id);
    });
  }
}
```

Check out the full [documentation](https://vercube.dev/docs/modules/telemetry/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
