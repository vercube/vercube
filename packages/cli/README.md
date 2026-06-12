<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/cli

### Command-line tools for Vercube

[![Ask DeepWiki](<https://img.shields.io/badge/ask-deepwiki-%20blue?style=for-the-badge&logo=bookstack&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)](https://deepwiki.com/vercube/vercube)
![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fcli?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fcli>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Dev server, production builds, custom commands - all from the command line. `vercube dev` to start, `vercube build` when you're ready to ship.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Dev server** - hot-reload out of the box
- **Production build** - optimized bundles ready for deployment
- **Project scaffolding** - `vercube init` to create a new project from the starter template
- **Endpoint testing** - `vercube fetch /path` to test endpoints without a running server
- **Custom commands** - define your own commands with `@Command`, `@Arg`, `@Flag` decorators
- **Dependency injection** - commands integrate with `@vercube/di` for service injection
- **Config loading** - reads `vercube.config.ts` automatically

## 📦 Installation

```bash
pnpm add @vercube/cli
```

### Custom commands

Import from `@vercube/cli/toolkit` and register in `vercube.config.ts`:

```ts
import { BaseCommand, Command, Flag } from '@vercube/cli/toolkit';

@Command({ name: 'deploy', description: 'Deploy to production' })
export class DeployCommand extends BaseCommand {
  @Flag({ name: 'env', description: 'Target environment', default: 'staging' })
  public env: string;

  public override async run(): Promise<void> {
    console.log(`Deploying to ${this.env}...`);
  }
}
```

See the [Custom CLI Command](https://vercube.dev/docs/advanced/custom-cli-command) docs for the full API.

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
