<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/auth

### Authentication for Vercube apps

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fauth?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fauth>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Flexible authentication module - protect your endpoints with `@Auth()`, inject users with `@User()`, and implement any auth strategy you need (JWT, sessions, API keys, whatever).**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Provider-based** - implement your own auth logic by extending `AuthProvider`
- **Simple decorators** - `@Auth()` protects routes, `@User()` gives you the current user
- **Role-based access** - `@Auth({ roles: ['admin'] })` restricts by role
- **Type-safe** - full TypeScript support with generic user types

## 📦 Installation

```bash
pnpm add @vercube/auth
```

## 📖 Usage

Check out the full [documentation](https://vercube.dev/docs/modules/auth/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
