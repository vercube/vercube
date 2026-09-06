import { context } from '@opentelemetry/api';
import { Body, Controller, createApp, Get, Post } from '@vercube/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TelemetryPlugin } from '../src/Plugins/TelemetryPlugin';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';
import type { App } from '@vercube/core';

@Controller('/echo')
class EchoController {
  @Post('/json')
  public json(@Body() body: unknown): unknown {
    return body;
  }

  @Get('/stream')
  public stream(): Response {
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
  }

  @Get('/binary')
  public binary(): Response {
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'application/octet-stream' } });
  }
}

let app: App;
let telemetry: TestTelemetry;

/**
 * Reads a body span event off the named span.
 *
 * @param name - Span name
 * @param event - Event name
 * @returns The event attributes
 */
function bodyEvent(name: string, event: string): Record<string, unknown> | undefined {
  return telemetry.span(name)?.events.find((candidate) => candidate.name === event)?.attributes;
}

describe('request body capture', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    app = await createApp({
      cfg: { telemetry: { spans: { bodies: { maxBytes: 32 } } }, requestLogging: false },
      setup: (instance) => {
        instance.container.bind(EchoController);
        instance.addPlugin(TelemetryPlugin);
      },
    });
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await telemetry.shutdown();
    context.disable();
  });

  it('records the request and response bodies', async () => {
    await app.fetch(
      new Request('http://localhost/echo/json', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hi: true }),
      }),
    );
    await telemetry.settle();

    expect(bodyEvent('POST /echo/json', 'http.request.body')).toMatchObject({
      'body.content_type': 'application/json',
      'body.text': '{"hi":true}',
      'body.truncated': false,
    });
    expect(bodyEvent('POST /echo/json', 'http.response.body')).toMatchObject({ 'body.text': '{"hi":true}' });
  });

  it('truncates a body past the cap and still reports its real size', async () => {
    const payload = JSON.stringify({ value: 'x'.repeat(200) });

    await app.fetch(
      new Request('http://localhost/echo/json', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      }),
    );
    await telemetry.settle();

    const event = bodyEvent('POST /echo/json', 'http.request.body')!;

    expect(event['body.truncated']).toBe(true);
    expect(event['body.size']).toBe(payload.length);
    expect((event['body.text'] as string).length).toBeLessThanOrEqual(32);
  });

  it('never reads a server-sent-events body', async () => {
    await app.fetch(new Request('http://localhost/echo/stream'));
    await telemetry.settle();

    expect(bodyEvent('GET /echo/stream', 'http.response.body')).toMatchObject({ 'body.omitted': 'streaming' });
  });

  it('marks a binary body instead of decoding it', async () => {
    await app.fetch(new Request('http://localhost/echo/binary'));
    await telemetry.settle();

    const event = bodyEvent('GET /echo/binary', 'http.response.body')!;

    expect(event['body.omitted']).toBe('binary');
    expect(event['body.text']).toBeUndefined();
  });

  it('keeps the span duration free of the capture cost', async () => {
    await app.fetch(new Request('http://localhost/echo/binary'));
    await telemetry.settle();

    const span = telemetry.span('GET /echo/binary')!;
    const durationMs = span.duration[0] * 1000 + span.duration[1] / 1e6;

    expect(durationMs).toBeLessThan(50);
  });
});
