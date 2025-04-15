# Getting Started

Welcome to Vercube! This guide will help you set up your first project in just a few minutes.

Before diving into installation, you might want to learn more about [what Vercube is and why you should use it](/guide/).

## Play Online
If you just want to play around with Vercube without setting up a project, you can use one of our online sandboxes:
<div class="sandboxes">
  <a href="https://stackblitz.com/edit/vercube-starter" class="sandbox" target="_blank">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M10.797 14.182H3.635L16.728 0l-3.525 9.818h7.162L7.272 24l3.524-9.818Z"></path></svg>
    </div>
    <div class="name">Open on StackBlitz</div>
  </a>
  <a href="https://codesandbox.io/p/devbox/vercube-starter-97s34j" class="sandbox" target="_blank">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M0 24h24V0H0v2.455h21.546v19.09H2.454V0H0Z"></path></svg>
    </div>
    <div class="name">Open on CodeSandbox</div>
  </a>
</div>

## Prerequisites

Before you begin, make sure you have one of the following environments:
- [Node.js](https://nodejs.org/en) >= 22.0.0
- [Bun](https://bun.sh) >= 1.2.0
- [Deno](https://deno.land) >= 2.0.0

::: tip
We recommend using the latest stable versions of these runtimes for the best experience.
:::

## Quick Start

The easiest way to get started with Vercube is to use the official project generator:
::: code-group

```bash [pnpm]
$ pnpm create vercube@latest
```
```bash [npm]
$ npx create-vercube@latest
```
```bash [yarn]
$ yarn create vercube
```
```bash [bun]
$ bun create vercube
```

:::

Once the installation is complete, you can start the development server:

```bash
$ cd your-project-name
$ pnpm dev
```

Visit `http://localhost:3000` in your browser, and you should see your Vercube application running!

::: tip Hot Reload
The development server includes hot-reloading, so your changes will be reflected immediately without needing to restart the server.
:::