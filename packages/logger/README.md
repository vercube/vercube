<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/logger

### Logging for Vercube apps

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Flogger?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Flogger>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Structured wide-event logging powered by [evlog](https://evlog.dev) - pretty in dev, JSON in production, with sampling, redaction and pluggable drains. Just inject `Logger` and go.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Powered by evlog** - structured, wide-event logging under a simple `Logger` API
- **Log levels** - debug, info, warn, error
- **Wide events** - accumulate context with `set()` / `child()` and `emit()` once
- **Drains & adapters** - ship logs to Axiom, OTLP, Sentry, Datadog and more
- **DI integration** - just `@Inject(Logger)` wherever you need it

## 📦 Installation

```bash
pnpm add @vercube/logger
```

## 📖 Usage

Check out the full [documentation](https://vercube.dev/docs/modules/logger/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
