<div align="center">
  <a href="https://vercube.dev/"><img src="../.github/assets/logo.png" alt="Vite logo" width="200"></a>
</div>

# Vercube

**Next generation HTTP framework**
An ultra-efficient JavaScript server framework that runs anywhere - Node.js, Bun, or Deno - with unmatched flexibility and complete configurability for developers who refuse to sacrifice speed or control.

## <a name="getting-started">🚀 Quick Start</a>

| Example           | Source                                                                                             | Try                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `hello-world`     | [examples/base](https://github.com/vercube/vercube/tree/main/examples/base/)                       | `npx giget gh:vercube/vercube/examples/base vercube-base`             |
| `aws-lambda`      | [examples/aws-lambda](https://github.com/vercube/vercube/tree/main/examples/aws-lambda/)           | `npx giget gh:vercube/vercube/examples/aws-lambda vercube-aws`        |
| `azure-functions` | [examples/azure-functions](https://github.com/vercube/vercube/tree/main/examples/azure-functions/) | `npx giget gh:vercube/vercube/examples/azure-functions vercube-azure` |
| `websockets`      | [examples/websockets](https://github.com/vercube/vercube/tree/main/examples/websockets/)           | `npx giget gh:vercube/vercube/examples/websockets vercube-wss`        |

## <a name="running-locally">🛠️ Running Examples Locally</a>

From the root directory, you can run any example using `pnpm --filter`:

```bash
# Development mode
pnpm --filter @examples/base dev
pnpm --filter @examples/ws dev
pnpm --filter @examples/aws-lambda dev
```
