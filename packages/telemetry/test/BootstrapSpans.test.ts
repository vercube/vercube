import { context } from '@opentelemetry/api';
import { Controller, createApp, Get } from '@vercube/core';
import { Inject } from '@vercube/di';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapRecorder, BOOTSTRAP_SPAN_NAME } from '../src/Bootstrap/BootstrapSpans';
import { TelemetryPlugin } from '../src/Plugins/TelemetryPlugin';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { App } from '@vercube/core';

class Repository {
  public find(): string {
    return 'row';
  }
}

class ReportService {
  @Inject(Repository)
  private readonly gRepository!: Repository;

  public run(): string {
    return this.gRepository.find();
  }
}

@Controller('/reports')
class ReportsController {
  @Inject(ReportService)
  private readonly gReports!: ReportService;

  @Get('/')
  public list(): unknown {
    return { row: this.gReports.run() };
  }
}

let app: App;
let telemetry: TestTelemetry;
let spans: ReadableSpan[];

describe('bootstrap spans', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();
    bootstrapRecorder.reset();

    const plugin = new TelemetryPlugin();
    // `configure` normally runs while the config is loading, which is earlier
    // than any test can reach through createApp.
    plugin.configure({ telemetry: true });

    app = await createApp({
      cfg: { telemetry: true, requestLogging: false },
      setup: (instance) => {
        // Bound outermost-first on purpose: the container flushes singletons in
        // bind order, so this is what makes the controller pull its
        // dependencies in and produces genuinely nested constructions.
        instance.container.bind(ReportsController);
        instance.container.bind(ReportService);
        instance.container.bind(Repository);
        instance.addPlugin(TelemetryPlugin);
      },
    });

    await app.fetch(new Request('http://localhost/reports'));
    spans = telemetry.spans();
  });

  afterAll(async () => {
    bootstrapRecorder.reset();
    await telemetry.shutdown();
    context.disable();
  });

  it('replays container construction as a trace', () => {
    const root = spans.find((span) => span.name === BOOTSTRAP_SPAN_NAME);

    expect(root).toBeDefined();
    expect(spans.some((span) => span.name === 'ReportService')).toBe(true);
    expect(spans.some((span) => span.name === 'Repository')).toBe(true);
  });

  it('keeps the whole bootstrap in one trace', () => {
    const root = spans.find((span) => span.name === BOOTSTRAP_SPAN_NAME)!;
    const service = spans.find((span) => span.name === 'ReportService')!;

    expect(service.spanContext().traceId).toBe(root.spanContext().traceId);
  });

  it('nests a dependency under the service that pulled it in', () => {
    const service = spans.find((span) => span.name === 'ReportService')!;
    const repository = spans.find((span) => span.name === 'Repository')!;

    expect(repository.parentSpanContext?.spanId).toBe(service.spanContext().spanId);
  });

  it('tags construction spans with the binding kind', () => {
    const service = spans.find((span) => span.name === 'ReportService')!;

    expect(service.attributes).toMatchObject({ 'vercube.di.key': 'ReportService', 'vercube.di.kind': 'singleton' });
  });

  it('keeps bootstrap out of the request trace', () => {
    const root = spans.find((span) => span.name === BOOTSTRAP_SPAN_NAME)!;
    const request = spans.find((span) => span.name === 'GET /reports/')!;

    expect(request.spanContext().traceId).not.toBe(root.spanContext().traceId);
  });

  it('replays only once', async () => {
    const before = telemetry.spans().filter((span) => span.name === BOOTSTRAP_SPAN_NAME).length;

    await app.fetch(new Request('http://localhost/reports'));

    expect(telemetry.spans().filter((span) => span.name === BOOTSTRAP_SPAN_NAME)).toHaveLength(before);
  });
});
