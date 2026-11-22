# Cloudflare Workers example

A Vercube application deployed as a Cloudflare Worker, with a variable from `wrangler.jsonc` read through `CloudflareBindings` and a static file served by Cloudflare.

```sh
pnpm dev       # the application on Node, with reload
pnpm preview   # the built Worker on workerd, at http://localhost:8787
pnpm run deploy   # needs `wrangler login`
```

`GET /api/foo` answers with the `GREETING` variable, `GET /hello.txt` is `public/hello.txt`.
