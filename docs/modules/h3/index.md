# H3
The H3 module provides integration between Vercube applications and the H3 HTTP framework. 
It allows you to:

- Mount Vercube applications on [H3](https://h3.dev) server
- Use H3's routing capabilities with Vercube's application logic
- Integrate Vercube with other H3-based frameworks


## Install
The easiest way to get started with Vercube DI is to use install package:
::: code-group

```bash [pnpm]
$ pnpm add @vercube/h3
```
```bash [npm]
$ npm i @vercube/h3
```
```bash [yarn]
$ yarn add @vercube/h3
```
```bash [bun]
$ bun add @vercube/h3
```
:::

### Usage

```ts
import { createApp } from '@vercube/core';
import { toH3 } from '@vercube/h3';
import { H3, serve } from 'h3';

// Create Vercube app
const app = await createApp();

// Create H3 server
const h3app = new H3();

// Mount Vercube app at /api path
h3app.all('/api/**', toH3(app));

// Start the server
await serve(h3app, { port: 3000 });
```