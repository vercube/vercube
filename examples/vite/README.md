# Vercube + Vite + Vue

A plain Vite + Vue app whose frontend talks to a Vercube API running in the same
dev server via [`@vercube/vite`](../../packages/vite).

- **Vite** serves the Vue frontend (`index.html`, `src/main.ts`, `src/App.vue`) with HMR.
- **Vercube** handles only its own routes under `/api` (controllers in `src/server`, auto-discovered).
- Requests that don't match a Vercube route fall through to Vite — that's why the frontend loads normally.

## Run

```bash
pnpm dev      # vite — open http://localhost:3010
```

The page fetches `GET /api/hello/:name` from the Vercube controller and round-trips a
WebSocket message to the `/echo` namespace.

## Build

```bash
pnpm build    # vite build → frontend + server into dist/
```

Produces `dist/index.html` + `dist/assets/*` (the Vue frontend) and `dist/index.mjs`
(the Vercube server, runnable with `node dist/index.mjs`).

## Layout

```
index.html              # Vite entry (frontend)
src/main.ts, App.vue     # Vue app, calls the Vercube API
src/server/              # Vercube — auto-discovered controllers
  Controllers/HelloController.ts   # GET /api/hello, /api/hello/:name
  Controllers/EchoWsController.ts  # WebSocket @Namespace('/echo')
  Boot/Setup.ts                    # registers @vercube/ws
```
