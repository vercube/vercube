<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/testing

### Test Vercube apps the way you write them

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Ftesting?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Ftesting>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Real controllers, real DI, real middleware and validation, with any dependency swapped for a fake. No port, no `vercube.config.ts` read by accident, and no particular test runner.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Runner-agnostic** - works under Vitest, `bun test`, `deno test` and `node --test`, bring your own mocks
- **Isolated** - every app gets its own container, router and config, nothing is read from disk unless asked
- **No network** - requests go through `app.fetch()`, `listen()` is never called
- **Overrides that win** - applied after plugins, so a fake always replaces what a plugin bound
- **Readable failures** - a failed `.expect()` prints the request and the response, credentials withheld
- **Logs, cookies, SSE** - a recording logger, a cookie-keeping agent and an event stream reader

## 📦 Installation

```bash
pnpm add -D @vercube/testing
```

## 📖 Usage

```ts
import { createTestApp } from '@vercube/testing';

const app = await createTestApp({
  controllers: [UserController],
  providers: [UserService],
  overrides: [[UserRepository, { findById: async (id) => ({ id, name: 'Ada' }) }]],
});

const res = await app.get('/users/1').expect(200);
expect(await res.json()).toEqual({ id: '1', name: 'Ada' });

await app.close();
```

Check out the full [documentation](https://vercube.dev/docs/modules/testing/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
