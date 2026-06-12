# Custom plugin example

Shows a **`BasePlugin`** registered only from **`vercube.config.ts`**, with **`withPluginOptions(HealthPlugin, { … })`** so options match **`HealthPluginOptions`** without writing **`satisfies`** / **`typeof`**.

- **`configure`** - optional merge into build config (extra Rolldown **`external`**s from options).
- **`setup`** - binds **`HealthController`** so `GET /_health/` responds in the worker.
- **`setupCLI`** - registers **`vercube plugin-info`** via `ctx.register(PluginInfoCommand)`.

There is no `app.addPlugin()` in `createApp`; the plugin pipeline loads from config.

**Note:** Anything imported from `vercube.config.ts` is executed by **jiti**, which does not apply `tsconfig` `paths`. This example uses **relative imports** inside `HealthPlugin.ts` instead of the `@/` alias so `pnpm dev` / CLI config loading works.

## From the monorepo root

```bash
pnpm install
pnpm --filter @examples/custom-plugin dev
```

In another terminal:

```bash
curl -s http://localhost:3000/_health/
pnpm --filter @examples/custom-plugin plugin-info
```

## Docs

See **[Plugins](https://vercube.dev/docs/advanced/custom-plugin)** and the **[Examples](https://vercube.dev/docs/getting-started/examples)** overview on the docs site (or `docs/` in the repo).

## Copy with giget

```bash
npx giget gh:vercube/vercube/examples/custom-plugin vercube-custom-plugin
```
