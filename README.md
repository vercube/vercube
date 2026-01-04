<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# Vercube

### Next generation HTTP framework

[![Ask DeepWiki](https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f)](https://deepwiki.com/vercube/vercube)
![NPM Version](https://img.shields.io/npm/v/%40vercube%2Fcore?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fcore)
![GitHub License](https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f)
![Codecov](https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f)

**An ultra-efficient JavaScript server framework that runs anywhere - Node.js, Bun, or Deno - with unmatched flexibility and complete configurability for developers who refuse to sacrifice speed or control.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Declarative Routing** - TypeScript decorators for clean, readable API endpoints
- **Dependency Injection** - Built-in IoC container for testable, maintainable code
- **Runtime Agnostic** - Runs on Node.js, Bun, and Deno with zero configuration
- **Type-Safe Validation** - [Standard Schema](https://standardschema.dev/) support (Zod, Valibot, ArkType)
- **High Performance** - Native Request/Response handling, no middleware overhead
- **Zero Config** - Sensible defaults, start coding immediately
- **Modular Architecture** - Auth, Logger, Storage, WebSockets, Serverless, and more

## 🚀 Quick Start

### Create a New Project

```bash
# pnpm
pnpm create vercube@latest

# npm
npx create-vercube@latest

# bun
bun create vercube
```

### Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) - you're ready to go! 🚀

### Try It Online

<a href="https://stackblitz.com/edit/vercube-starter" target="_blank">
  <img src="https://img.shields.io/badge/open_in-StackBlitz-blue?style=for-the-badge&logo=stackblitz&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f
" alt="Open in StackBlitz">
</a>
<a href="https://codesandbox.io/p/devbox/vercube-starter-97s34j" target="_blank">
  <img src="https://img.shields.io/badge/open_in-CodeSandbox-blue?style=for-the-badge&logo=stackblitz&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f
" alt="Open in CodeSandbox">
</a>

## 📝 Example

```ts
import { Controller, Get, Post, Body, Param } from '@vercube/core';
import { Inject } from '@vercube/di';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

type CreateUserDto = z.infer<typeof CreateUserSchema>;

@Controller('/users')
export class UserController {

  @Inject(UserService)
  private userService!: UserService;

  @Get('/')
  async getUsers() {
    return this.userService.findAll();
  }

  @Get('/:id')
  async getUser(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post('/')
  async createUser(@Body({ validationSchema: CreateUserSchema }) data: CreateUserDto) {
    return this.userService.create(data);
  }
}
```

More examples available in the [examples directory](https://github.com/vercube/vercube/tree/main/examples/).

## 📦 Packages

| Package                                                                  | Description                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| [@vercube/core](https://www.npmjs.com/package/@vercube/core)             | Core framework with routing, DI, and middleware |
| [@vercube/auth](https://www.npmjs.com/package/@vercube/auth)             | Authentication decorators and middleware        |
| [@vercube/logger](https://www.npmjs.com/package/@vercube/logger)         | Flexible logging with multiple drivers          |
| [@vercube/storage](https://www.npmjs.com/package/@vercube/storage)       | File storage abstraction layer                  |
| [@vercube/ws](https://www.npmjs.com/package/@vercube/ws)                 | WebSocket support                               |
| [@vercube/serverless](https://www.npmjs.com/package/@vercube/serverless) | AWS Lambda & Azure Functions adapters           |

## 📖 Documentation

Comprehensive documentation is available at **[vercube.dev](https://vercube.dev)**

## ❤️ Contribute

We welcome contributions! Here's how you can help:

- 🐛 **Report bugs** - [Open an issue](https://github.com/vercube/vercube/issues) with reproduction steps
- 💡 **Submit PRs** - Check out our [contribution guidelines](CONTRIBUTING.md)
- 💬 **Join the community** - [Discord server](https://discord.gg/safphS45aN)
- 📝 **Improve docs** - Help make documentation clearer

Every contribution matters. We maintain a welcoming environment for all contributors.
