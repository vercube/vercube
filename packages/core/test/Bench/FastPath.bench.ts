import { describe, test } from 'vitest';
import { Controller, createApp, Get } from '../../src';
import { RequestHandler } from '../../src/Services/Router/RequestHandler';
import { Router } from '../../src/Services/Router/Router';

@Controller('/bench')
class BenchController {
  @Get('/plain')
  public plain(): unknown {
    return { ok: true };
  }
}

const app = await createApp({
  cfg: { requestLogging: false, requestContext: false },
  setup: (instance) => instance.container.bind(BenchController),
});

const handler = app.container.get(RequestHandler);
const route = app.container.get(Router).match('GET', '/bench/plain')!;
const request = new Request('http://localhost/bench/plain');

// Deliberately synchronous: this measures the dispatch branch itself, not the
// promise machinery around it, which is where a telemetry check would show up.
describe('[Bench] Request fast path', () => {
  test('handleRequest - simple route, telemetry off', async ({ bench }) => {
    await bench('handleRequest - simple route, telemetry off', () => {
      handler.handleRequest(request, route);
    }).run();
  });
});
