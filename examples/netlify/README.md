# Netlify example

A Vercube application deployed as a Netlify Function. The controller reads the Netlify context of the request, and `public/hello.txt` is served by the CDN.

```sh
pnpm dev          # the application on Node, with reload
pnpm preview      # the built function behind Netlify's local CDN, at http://localhost:8888
pnpm run deploy   # needs `netlify login` and `netlify link`
```

`GET /api/foo` answers with a greeting and the visitor's country, `GET /hello.txt` is `public/hello.txt`.

Run `preview` from a copy of this directory outside the monorepo (`npx giget gh:vercube/vercube/examples/netlify`): inside a workspace the Netlify CLI looks for the site at the workspace root.
