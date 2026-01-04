<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/ws
### WebSockets for Vercube apps

  ![NPM Version](https://img.shields.io/npm/v/%40vercube%2Fws?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fws)
  ![GitHub License](https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f)
  ![Codecov](https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f)

  **Real-time communication with decorators - `@Message` to listen, `@Emit` to respond, `@Broadcast` to send to everyone. Built on [crossws](https://crossws.unjs.io/).**

  [Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Decorator-based** - `@Namespace`, `@Message`, `@Emit`, `@Broadcast`
- **Connection control** - validate who can connect with `@OnConnectionAttempt`
- **Message validation** - use Zod schemas to validate incoming data
- **Namespaces** - organize connections into logical groups

## 📦 Installation

```bash
pnpm add @vercube/ws
```

## 📖 Usage

Check out the full [documentation](https://vercube.dev/docs/modules/web-sockets/overview)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
