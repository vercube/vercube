import { describe, test } from 'vitest';
import { Body, Controller, createApp, Get, Param, Post, QueryParam } from '../../src';
import { RequestHandler } from '../../src/Services/Router/RequestHandler';
import { Router } from '../../src/Services/Router/Router';

/**
 * Argument resolution is the part of the request path that grows with the
 * handler signature, and the two shapes below are the ones an application
 * actually writes: a path parameter next to a query parameter, and a JSON body.
 *
 * Measured here rather than over HTTP because the difference being guarded is a
 * few hundred nanoseconds per request, which a loopback socket buries under its
 * own variance.
 */
@Controller('/bench')
class ArgsController {
  @Get('/id/:id')
  public query(@Param('id') id: string, @QueryParam({ name: 'name' }) name: string | null): unknown {
    return { id, name };
  }

  @Post('/json')
  public body(@Body() payload: unknown): unknown {
    return payload;
  }
}

const app = await createApp({
  cfg: { requestLogging: false, requestContext: false },
  setup: (instance) => instance.container.bind(ArgsController),
});

const handler = app.container.get(RequestHandler);
const router = app.container.get(Router);

const queryRoute = router.match('GET', '/bench/id/1')!;
const queryRequest = new Request('http://localhost/bench/id/1?name=bun');

const bodyRoute = router.match('POST', '/bench/json')!;
const bodyPayload = JSON.stringify({ hello: 'world' });

describe('[Bench] Argument resolution', () => {
  test('handleRequest - path parameter and query parameter', async ({ bench }) => {
    await bench('handleRequest - path parameter and query parameter', () => {
      handler.handleRequest(queryRequest, queryRoute);
    }).run();
  });

  test('handleRequest - JSON body', async ({ bench }) => {
    await bench('handleRequest - JSON body', async () => {
      // A fresh request per iteration: a body can only be read once.
      await handler.handleRequest(
        new Request('http://localhost/bench/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyPayload,
        }),
        bodyRoute,
      );
    }).run();
  });
});
