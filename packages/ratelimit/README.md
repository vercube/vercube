<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/ratelimit

### Rate limits for Vercube routes, shared across every instance

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fratelimit?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fratelimit>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**One decorator per route, counters in `@vercube/storage`: in memory for one instance, in Redis for all of them.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Decorator driven** - `@RateLimit()` on a route or a controller, `@RateLimit(false)` to lift it
- **Nearest wins** - a method limit replaces the controller's, which replaces the app-wide one from `vercube.config.ts`
- **Shared counters** - stored in any `@vercube/storage` mount, atomic on the memory and Redis drivers
- **Fixed or sliding window** - pick per route
- **Standard answers** - `429` with `Retry-After` and `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, typed in the generated client and OpenAPI
- **Safe client addresses** - `x-forwarded-for` is only read behind trusted proxies, counted from the right
- **Fail open or closed** - choose what happens when the storage is down

## 📦 Installation

```bash
pnpm add @vercube/ratelimit @vercube/storage
```

## 📖 Usage

```ts
@Controller('/auth')
export class AuthController {
  @Post('/login')
  @RateLimit({ limit: 5, window: '1m' })
  public login(): void {}
}
```

```ts
// vercube.config.ts
export default defineConfig({
  rateLimit: { limit: 300, window: '1m', storage: 'redis', trustProxy: 1 },
  plugins: [RateLimitPlugin],
});
```

Check out the full [documentation](https://vercube.dev/docs/modules/ratelimit/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
