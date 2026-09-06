import { createServer } from 'node:http';
import { context } from '@opentelemetry/api';
import { Controller, createApp, Get } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Telemetry } from '../src/Common/Telemetry';
import { TelemetryPlugin } from '../src/Plugins/TelemetryPlugin';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';
import type { App } from '@vercube/core';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

@Controller('/audit')
class AuditController {
  @Get('/:id')
  public byId(): unknown {
    app.container.get(Logger).info('audit', 'record read');
    return { ok: true };
  }
}

const received: any[] = [];

let collector: Server;
let app: App;
let telemetry: TestTelemetry;

describe('OTLP log export', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    collector = createServer((request, response) => {
      const chunks: Buffer[] = [];

      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        if (request.url === '/v1/logs') {
          received.push(JSON.parse(Buffer.concat(chunks).toString()));
        }

        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      });
    });

    await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;

    app = await createApp({
      cfg: { telemetry: { logs: true, endpoint }, logLevel: 'debug' },
      setup: (instance) => {
        instance.container.bind(AuditController);
        instance.addPlugin(TelemetryPlugin);
      },
    });

    await app.fetch(new Request('http://localhost/audit/7'));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => collector.close(() => resolve()));
    await telemetry.shutdown();
    context.disable();
  });

  it('sends log records to the collector, correlated with the trace', async () => {
    // The drain batches on a five second interval; flush instead of waiting.
    await app.container.get(Telemetry).flush();

    const records = received.flatMap((payload) =>
      payload.resourceLogs.flatMap((resource: any) => resource.scopeLogs.flatMap((scope: any) => scope.logRecords)),
    );

    expect(records.length).toBeGreaterThan(0);

    const span = telemetry.span('GET /audit/:id')!;
    const correlated = records.filter((record: any) => record.traceId === span.spanContext().traceId);

    expect(correlated.length).toBeGreaterThan(0);
    expect(correlated.some((record: any) => record.spanId === span.spanContext().spanId)).toBe(true);
  });
});
