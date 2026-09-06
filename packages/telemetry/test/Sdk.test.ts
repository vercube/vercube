import { createServer } from 'node:http';
import { context } from '@opentelemetry/api';
import { Controller, createApp, Get } from '@vercube/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TelemetryPlugin } from '../src/Plugins/TelemetryPlugin';
import { startNodeTelemetry } from '../src/Sdk';
import type { NodeTelemetry } from '../src/Sdk';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

@Controller('/orders')
class OrdersController {
  @Get('/:id')
  public byId(): unknown {
    return { ok: true };
  }
}

/** Everything the fake collector received on `POST /v1/traces`. */
const payloads: any[] = [];

let collector: Server;
let telemetry: NodeTelemetry;

/**
 * Starts a throwaway OTLP/HTTP collector.
 *
 * @returns The listening server and its base URL
 */
async function startCollector(): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (request.url === '/v1/traces') {
        payloads.push(JSON.parse(Buffer.concat(chunks).toString()));
      }

      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('startNodeTelemetry', () => {
  beforeAll(async () => {
    const started = await startCollector();
    collector = started.server;

    telemetry = await startNodeTelemetry({
      serviceName: 'orders-test',
      serviceVersion: '9.9.9',
      endpoint: started.url,
      sampler: 'always',
    });

    const app = await createApp({
      cfg: { telemetry: true, requestLogging: false },
      setup: (instance) => {
        instance.container.bind(OrdersController);
        instance.addPlugin(TelemetryPlugin);
      },
    });

    await app.fetch(new Request('http://localhost/orders/7'));

    // Shutting the provider down flushes the batch processor.
    await telemetry.shutdown();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => collector.close(() => resolve()));
    context.disable();
  });

  it('exports the request span over OTLP/HTTP', () => {
    const spans = payloads.flatMap((payload) =>
      payload.resourceSpans.flatMap((resource: any) => resource.scopeSpans.flatMap((scope: any) => scope.spans)),
    );

    expect(spans.map((span: any) => span.name)).toContain('GET /orders/:id');
  });

  it('stamps the configured resource attributes', () => {
    const attributes = payloads[0].resourceSpans[0].resource.attributes as { key: string; value: any }[];
    const byKey = Object.fromEntries(attributes.map((attribute) => [attribute.key, attribute.value.stringValue]));

    expect(byKey['service.name']).toBe('orders-test');
    expect(byKey['service.version']).toBe('9.9.9');
  });

  it('reports the framework as the instrumentation scope', () => {
    const scopes = payloads.flatMap((payload) =>
      payload.resourceSpans.flatMap((resource: any) => resource.scopeSpans.map((scope: any) => scope.scope.name)),
    );

    expect(scopes).toContain('@vercube/telemetry');
  });
});
