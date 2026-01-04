<div align="center">
  <img src="https://raw.githubusercontent.com/vercube/vercube/refs/heads/main/.github/assets/cover.png" width="100%" alt="Vercube - Unleash your server development." />
  <br>
  <br>

# @vercube/schema

### OpenAPI schema generation for Vercube

![NPM Version](<https://img.shields.io/npm/v/%40vercube%2Fschema?style=for-the-badge&logo=npm&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232e2e2e&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40vercube%2Fschema>)
![GitHub License](<https://img.shields.io/github/license/vercube/vercube?style=for-the-badge&logo=gitbook&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)
![Codecov](<https://img.shields.io/codecov/c/github/vercube/vercube?style=for-the-badge&logo=vitest&logoColor=rgba(255%2C%20255%2C%20255%2C%200.6)&labelColor=%23000&color=%232f2f2f>)

**Auto-generate OpenAPI specs from your Zod schemas. Add `@Schema` to your routes, get Swagger docs at `/_schema`.**

[Website](https://vercube.dev) • [Documentation](https://vercube.dev/docs/getting-started)

</div>

## ✨ Features

- **Zod-based** - define schemas once, use for validation AND docs
- **Decorator API** - `@Schema` on routes to add OpenAPI metadata
- **Auto-resolution** - picks up `@Body`, `@Param`, `@QueryParams` automatically
- **Runtime endpoint** - OpenAPI JSON available at `/_schema`

## 📦 Installation

```bash
pnpm add @vercube/schema
```

## 📖 Documentation

Check out the full docs at **[vercube.dev](https://vercube.dev)**

## 📜 License

[MIT](https://github.com/vercube/vercube/blob/main/LICENSE)
