import { describe, test } from 'vitest';
import { Controller, createApp, Get, HttpServer } from '../../src';
import type { App, ConfigTypes } from '../../src';

const ROWS = Array.from({ length: 50 }, (_, index) => ({
  id: index,
  name: `user ${index}`,
  email: `user${index}@example.com`,
  active: index % 2 === 0,
  tags: ['a', 'b', 'c'],
}));

@Controller('/bench')
class BenchController {
  @Get('/plain')
  public plain(): unknown {
    return { ok: true };
  }

  @Get('/rows')
  public rows(): unknown {
    return ROWS;
  }
}

function create(compression: ConfigTypes.Config['compression']): Promise<App> {
  return createApp({
    cfg: { requestLogging: false, requestContext: false, compression, server: { static: { dirs: [] } } },
    configFile: false,
    setup: (instance) => instance.container.bind(BenchController),
  });
}

const off = (await create(false)).container.get(HttpServer);
const on = (await create(true)).container.get(HttpServer);

const plain = new Request('http://localhost/bench/plain');
const plainGzip = new Request('http://localhost/bench/plain', { headers: { 'accept-encoding': 'gzip, br' } });
const rows = new Request('http://localhost/bench/rows');
const rowsGzip = new Request('http://localhost/bench/rows', { headers: { 'accept-encoding': 'gzip' } });
const rowsBrotli = new Request('http://localhost/bench/rows', { headers: { 'accept-encoding': 'br' } });

describe('[Bench] Response compression', () => {
  // The first two are synchronous on purpose: with compression off the server
  // must hand back the response of a synchronous route as it is, and with it
  // on a client that sent no Accept-Encoding costs a header lookup, no more.
  test('compression off - simple route', async ({ bench }) => {
    await bench('compression off - simple route', () => {
      off.handleRequest(plainGzip);
    }).run();
  });

  test('compression on - no Accept-Encoding', async ({ bench }) => {
    await bench('compression on - no Accept-Encoding', () => {
      on.handleRequest(plain);
    }).run();
  });

  test('compression on - body under the threshold', async ({ bench }) => {
    await bench('compression on - body under the threshold', async () => {
      await on.handleRequest(plainGzip);
    }).run();
  });

  test('compression off - 50 object JSON payload', async ({ bench }) => {
    await bench('compression off - 50 object JSON payload', async () => {
      await (await off.handleRequest(rows)).arrayBuffer();
    }).run();
  });

  test('compression on - 50 object JSON payload, gzip', async ({ bench }) => {
    await bench('compression on - 50 object JSON payload, gzip', async () => {
      await (await on.handleRequest(rowsGzip)).arrayBuffer();
    }).run();
  });

  test('compression on - 50 object JSON payload, Brotli', async ({ bench }) => {
    await bench('compression on - 50 object JSON payload, Brotli', async () => {
      await (await on.handleRequest(rowsBrotli)).arrayBuffer();
    }).run();
  });
});
