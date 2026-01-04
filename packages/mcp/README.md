<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/mcp

### Model Context Protocol for Vercube

![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fmcp?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fmcp>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Expose your app's functionality to AI agents via [MCP](https://modelcontextprotocol.io/). Define tools with `@MCPTool`, validate with Zod, let LLMs call your code.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Decorator-based** - `@MCPTool` on methods to expose them as tools
- **Type-safe** - Zod schemas for input/output validation
- **Auto endpoint** - MCP protocol available at `/api/mcp`
- **Tool annotations** - mark tools as read-only, idempotent, etc.

## 📦 Installation

```bash
pnpm add @vercube/mcp
```

## 📖 Usage

Check out the full [documentation](https://vercube.dev/docs/modules/mcp)

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
