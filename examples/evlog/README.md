# @examples/evlog

Demonstrates structured wide-event logging in a Vercube app using [`@vercube/evlog`](../../packages/evlog).

## What this example shows

- Registering `EvlogPlugin` to replace the default console logger with [evlog](https://evlog.dev)
- Excluding health-check routes from request logging via the `exclude` option
- Enriching the wide event with `logger.setContext()` — no `RequestContext` needed

## Project structure

```
src/
  boot/
    Container.ts          — DI container setup
  Controllers/
    HealthController.ts   — GET /health (excluded from evlog)
    UsersController.ts    — GET /users, GET /users/:id, POST /users
  index.ts                — app entry point
vercube.config.ts         — EvlogPlugin registration
```

## Running

```bash
pnpm dev
```

Then make a request:

```bash
curl http://localhost:3000/users
```

You'll see a single structured log line per request, emitted when the response finishes:

```json
{
  "method": "GET",
  "path": "/users",
  "status": 200,
  "duration": 3,
  "resource": "users",
  "count": 2
}
```

The `/health` endpoint is excluded — no wide event is emitted for it.

## Shipping logs to a backend

Uncomment the `drain` option in `vercube.config.ts` and set `AXIOM_TOKEN` to forward every event to Axiom (or replace with your own backend):

```ts
provider: {
  drain: async ({ event }) => {
    await fetch('https://api.axiom.co/v1/datasets/my-app/ingest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([event]),
    });
  },
},
```
