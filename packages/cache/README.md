<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/cache

### Decorator driven caching for Vercube apps

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fcache?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fcache>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**One decorator turns any method into a cached one - with TTL, stale-while-revalidate, call deduplication and precise invalidation. Every entry lives in a regular Vercube storage.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **`@Cache()` decorator** - cache any method, keyed by its arguments
- **Backed by `@vercube/storage`** - memory, S3 or your own driver, no glue code
- **Stale-while-revalidate** - serve instantly, refresh in the background
- **Call deduplication** - concurrent calls for the same key share one execution
- **Precise invalidation** - `invalidate()` and `expire()` right on the decorated method
- **Self-invalidating** - entries are dropped when the method body or its options change
- **Multi-tier** - read through a fast local storage into a shared one

## 📦 Installation

```bash
pnpm add @vercube/cache @vercube/storage
```

## 📖 Usage

```ts
import { Cache } from '@vercube/cache';

export class UsersService {
  @Cache({ maxAge: 300, swr: true, staleMaxAge: 900 })
  public async getUser(id: string): Promise<User> {
    return this.database.findUser(id);
  }
}
```

Check out the full [documentation](https://vercube.dev/docs/modules/cache/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
