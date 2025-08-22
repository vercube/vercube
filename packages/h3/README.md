<div align="center">
  <a href="https://vercube.dev/"><img src="https://github.com/OskarLebuda/vue-lazy-hydration/raw/main/.github/assets/logo.png?raw=true" alt="Vite logo" width="200"></a>
  <br>
  <br>

# Vercube

Next generation HTTP framework

  <a href="https://www.npmjs.com/package/@vercube/h3">
    <img src="https://img.shields.io/npm/v/%40vercube%2Fh3?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://www.npmjs.com/package/@vercube/h3">
    <img src="https://img.shields.io/npm/dm/%40vercube%2Fh3?style=for-the-badge&logo=npm&color=%23767eff" alt="npm"/>
  </a>
  <a href="https://github.com/vercube/vercube/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/npm/l/%40vercube%2Fdi?style=for-the-badge&color=%23767eff" alt="License"/>
  </a>
  <a href="https://codecov.io/gh/vercube/vercube" target="_blank">
    <img src="https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&color=%23767eff" alt="Coverage"/>
  </a>
  <br/>
  <br/>
</div>

An ultra-efficient JavaScript server framework that runs anywhere - Node.js, Bun, or Deno - with unmatched flexibility and complete configurability for developers who refuse to sacrifice speed or control.

## <a name="module">H3 Module</a>

The H3 module provides integration between Vercube applications and the H3 HTTP framework.
It allows you to:

- Mount Vercube applications on [H3](https://h3.dev) server
- Use H3's routing capabilities with Vercube's application logic
- Integrate Vercube with other H3-based frameworks

### Basic Usage

```ts
import { createApp } from '@vercube/core';
import { toH3 } from '@vercube/h3';
import { H3, serve } from 'h3';

// Create Vercube app
const app = await createApp();

// Create H3 server
const h3app = new H3();

// Mount Vercube app at /api path
h3app.all('/api/**', toH3(app));

// Start the server
await serve(h3app, { port: 3000 });
```

## <a name="documentation">📖 Documentation</a>

Comprehensive documentation is available at [vercube.dev](https://vercube.dev). There you'll find detailed module descriptions, project information, guides, and everything else you need to know about Vercube.
