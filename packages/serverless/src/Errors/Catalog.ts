import { defineErrorCatalog } from '@vercube/di';

/**
 * The errors of `@vercube/serverless`.
 */
export const ServerlessErrors = defineErrorCatalog('VERCUBE_SERVERLESS', {
  STREAM_ABORTED: {
    message: ({ reason }: { reason: unknown }) => `Stream aborted: ${String(reason)}`,
    why: 'The body of a response was being collected into a buffer, and its stream errored before it ended. The message ends with the reason the stream gave.',
    fix: 'Look at the reason at the end of the message: it is the error of whatever produced the body, such as a generator of a `@Stream()` route that threw or an upstream `fetch()` that was cut off. Fix it there.',
  },
  CLOUDFLARE_BINDINGS_OUTSIDE_REQUEST: {
    message: 'CloudflareBindings was read outside a request. Bindings exist only while the Cloudflare adapter handles a request.',
    why: '`env`, `ctx` or `waitUntil()` of `CloudflareBindings` was used while no request was being handled, for example in a constructor, in the `setup` callback or in a timer that outlived its request. Cloudflare hands the bindings over with each request, so there are none in between.',
    fix: 'Read `env` and `ctx` inside a controller method or a service it calls, in an application served by `toServerlessHandler()` or `toPagesFunction()` from `@vercube/serverless/cloudflare`. In code that also runs outside a request, check the `active` getter of `CloudflareBindings` first.',
  },
  NETLIFY_CONTEXT_OUTSIDE_REQUEST: {
    message: 'NetlifyContext was read outside a request. The context exists only while the Netlify adapter handles a request.',
    why: '`context` or `waitUntil()` of `NetlifyContext` was used while no request was being handled, for example in a constructor, in the `setup` callback or in a timer that outlived its request. Netlify hands the context over with each request, so there is none in between.',
    fix: 'Read `context` inside a controller method or a service it calls, in an application served by `toServerlessHandler()` from `@vercube/serverless/netlify`. In code that also runs outside a request, check the `active` getter of `NetlifyContext` first.',
  },
});
