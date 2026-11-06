<div align="center">
  <a href="https://vercube.dev/"><img src="../../.github/assets/logo.png" alt="Vercube logo" width="200"></a>
</div>

# Vercube Client

A Vercube application and a script that calls it through `@vercube/client`. Every call is typed from the controllers: the path, its params, the query, the body and the response.

## <a name="getting-started">🚀 Quick Start</a>

```sh
$ pnpm i
$ pnpm dev
```

Then, in a second terminal:

```sh
$ pnpm client
```

Port 3000 taken? Start the server with `PORT=4000 pnpm dev` and point the script at it with `API_URL=http://localhost:4000 pnpm client`.

## 📁 What is where

| File                                | What it does                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/controller/TodoController.ts`  | CRUD routes with a param, a query field and a JSON body                                                                                 |
| `src/controller/ClockController.ts` | An `@Sse()` route that streams the time                                                                                                 |
| `.vercube/routes.d.ts`              | The route map: each route, the handler that serves it and where its arguments come from. `pnpm dev` and `pnpm build` keep it up to date |
| `client/main.ts`                    | The calls, including error handling and reading the event stream                                                                        |

Add a route to a controller while `pnpm dev` runs and it appears in the map, and in your editor's autocomplete for `api`. Try breaking a call in `client/main.ts`, for example `api.get('/api/todos/:id')` without `params`, or `body: { name: 'x' }` on the POST: the editor flags it.
