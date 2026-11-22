import {
  AppLifecycle,
  Controller,
  Get,
  Header,
  HealthRegistry,
  IntrospectionRegistry,
  Middleware,
  Param,
  Post,
  QueryParam,
  SetHeader,
} from '@vercube/core';
import { Inject } from '@vercube/di';
import { createInstrument, SpanKind, SpanStatusCode } from '@vercube/telemetry/instrument';
import { DEFAULT_DEVTOOLS_OPTIONS } from '../Constants/DevtoolsDefaults';
import { DevtoolsErrors } from '../Errors/Catalog';
import { DEVTOOLS_UI_HTML } from '../Generated/UI';
import { DevtoolsAuthMiddleware } from '../Middleware/DevtoolsAuthMiddleware';
import { DevtoolsProtocol } from '../Protocol/Frames';
import { AuditService } from '../Services/AuditService';
import { DevtoolsFrameBus } from '../Services/DevtoolsFrameBus';
import { OverviewCollector } from '../Services/OverviewCollector';
import { QueueIntrospection } from '../Services/QueueIntrospection';
import { SchedulerIntrospection } from '../Services/SchedulerIntrospection';
import { StorageIntrospection } from '../Services/StorageIntrospection';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import { DevtoolsTelemetry } from '../Telemetry/DevtoolsTelemetry';
import type { QueueMessages } from '../Services/QueueIntrospection';
import type { SchedulerRunResult } from '../Services/SchedulerIntrospection';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { HealthTypes } from '@vercube/core';

const instrument = createInstrument('@vercube/devtools');

/**
 * Told apart from the revision in an `ETag`: revisions are small counters that
 * start over with the process, so after a restart the same number can stand
 * for other data.
 */
const BOOT_ID = Math.random().toString(36).slice(2, 10);

/** Interval between keep-alive frames, in milliseconds. */
const PING_INTERVAL_MS = 20_000;

/** Signal buffers a client can read or clear. */
const SIGNALS = new Set(['traces', 'metrics', 'logs']);

/** Messages a queue listing reads when the caller asks for no usable number. */
const DEFAULT_MESSAGE_LIMIT = 20;

/**
 * Serves the devtools UI, its introspection API and the signal stream.
 *
 * The API has exactly three shapes: structural data behind
 * `/api/introspect/:id` with an `ETag`, signal snapshots behind
 * `/api/signals/:kind` as OTLP/JSON, and one server-sent-events stream that
 * pushes both as they change. {@link DevtoolsPlugin} rewrites the base path
 * before the decorators read it.
 */
@Controller(DEFAULT_DEVTOOLS_OPTIONS.path)
@Middleware(DevtoolsAuthMiddleware, { priority: -1000 })
export class DevtoolsController {
  @Inject($DevtoolsOptions)
  private readonly gOptions!: DevtoolsTypes.ResolvedOptions;

  @Inject(IntrospectionRegistry)
  private readonly gIntrospection!: IntrospectionRegistry;

  @Inject(DevtoolsTelemetry)
  private readonly gTelemetry!: DevtoolsTelemetry;

  @Inject(OverviewCollector)
  private readonly gOverview!: OverviewCollector;

  @Inject(AuditService)
  private readonly gAudit!: AuditService;

  @Inject(StorageIntrospection)
  private readonly gStorage!: StorageIntrospection;

  @Inject(QueueIntrospection)
  private readonly gQueues!: QueueIntrospection;

  @Inject(SchedulerIntrospection)
  private readonly gScheduler!: SchedulerIntrospection;

  @Inject(DevtoolsFrameBus)
  private readonly gBus!: DevtoolsFrameBus;

  @Inject(HealthRegistry)
  private readonly gHealth!: HealthRegistry;

  @Inject(AppLifecycle)
  private readonly gLifecycle!: AppLifecycle;

  /** The health run in progress, shared by every caller that asks while it runs. */
  private fHealthRun: Promise<HealthTypes.Report> | null = null;

  /** Streams currently open. */
  private fStreams: number = 0;

  /** Removes the invalidate listener shared by every open stream. */
  private fUnwatch: (() => void) | undefined;

  /** Ping timer shared by every open stream. */
  private fPing: ReturnType<typeof setInterval> | undefined;

  /**
   * Serves the single-file devtools UI.
   *
   * @returns An HTML response
   */
  @Get('/')
  public ui(): Response {
    return new Response(DEVTOOLS_UI_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  /**
   * Lists the available introspection sections and their revisions.
   *
   * @returns One descriptor per section
   */
  @Get('/api/introspect')
  @SetHeader('Cache-Control', 'no-store')
  public sections(): { sections: ReturnType<IntrospectionRegistry['list']> } {
    return { sections: this.gIntrospection.list() };
  }

  /**
   * Returns one introspection section.
   *
   * Sections change rarely and are rebuilt from scratch when they do, so they
   * carry their revision as an `ETag`: a UI that re-opens a panel gets a 304
   * instead of a fresh dependency graph.
   *
   * @param id - Section id
   * @param ifNoneMatch - Revision the client already holds
   * @returns The section, or a 304
   */
  @Get('/api/introspect/:id')
  public async section(@Param('id') id: string, @Header('if-none-match') ifNoneMatch?: string): Promise<Response> {
    const section = await this.gIntrospection.describe(id);

    if (!section) {
      throw DevtoolsErrors.UNKNOWN_SECTION({ id });
    }

    const etag = `"${BOOT_ID}-${section.revision}"`;

    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-cache' } });
    }

    return Response.json(section, { headers: { ETag: etag, 'Cache-Control': 'no-cache' } });
  }

  /**
   * Returns a buffered signal as an OTLP/JSON export request.
   *
   * @param kind - `traces`, `metrics` or `logs`
   * @returns The OTLP payload
   */
  @Get('/api/signals/:kind')
  @SetHeader('Cache-Control', 'no-store')
  public async signals(@Param('kind') kind: string): Promise<unknown> {
    this.assertSignal(kind);

    if (kind === 'metrics') {
      // Collection is normally driven by an open stream, so a bare snapshot has
      // to take a reading of its own or it comes back empty.
      await this.gTelemetry.metrics.collectNow();
      this.gTelemetry.metrics.ensureRunning();

      return this.gTelemetry.metrics.snapshot();
    }

    return kind === 'logs' ? this.gTelemetry.logs.snapshot() : this.gTelemetry.spans.snapshot();
  }

  /**
   * Empties a signal buffer. POST, because it changes something: a GET could
   * be fired cross-site by any `<img>` tag.
   *
   * @param kind - `traces`, `metrics` or `logs`
   * @returns Acknowledgement
   */
  @Post('/api/signals/:kind/clear')
  @SetHeader('Cache-Control', 'no-store')
  public clearSignals(@Param('kind') kind: string): { ok: boolean } {
    this.assertSignal(kind);

    if (kind === 'metrics') {
      this.gTelemetry.metrics.clear();
    } else if (kind === 'logs') {
      this.gTelemetry.logs.clear();
    } else {
      this.gTelemetry.spans.clear();
    }

    return { ok: true };
  }

  /**
   * Reads a single value out of a mounted storage.
   *
   * Kept out of the storage introspection section on purpose: listing what is
   * stored is cheap, reading arbitrary values is not, and doing it on demand
   * keeps a large value from being pulled in every time a panel refreshes.
   *
   * @param mount - Mount name
   * @param key - Key to read
   * @returns A preview of the value
   */
  @Get('/api/storage/value')
  @SetHeader('Cache-Control', 'no-store')
  public storageValue(
    @QueryParam({ name: 'mount' }) mount: string,
    @QueryParam({ name: 'key' }) key: string,
  ): Promise<DevtoolsTypes.StorageValue> {
    return this.gStorage.readValue(mount, key);
  }

  /**
   * Lists what a queue is holding, without consuming any of it.
   *
   * Kept out of the queues introspection section for the same reason as storage
   * values: this costs a broker round trip per queue, and only the queue
   * somebody opened is worth paying it for.
   *
   * @param queue - Queue to list
   * @param strategy - Mount to list it through
   * @param limit - How many messages to read
   * @returns The messages found, or why they could not be read
   */
  @Get('/api/queues/messages')
  @SetHeader('Cache-Control', 'no-store')
  public queueMessages(
    @QueryParam({ name: 'queue' }) queue: string,
    @QueryParam({ name: 'strategy' }) strategy: string,
    @QueryParam({ name: 'limit' }) limit: string,
  ): Promise<QueueMessages> {
    // `Number()` alone would forward -1, 1.5 or Infinity as a message count.
    const requested = Number(limit);
    const parsed = Number.isSafeInteger(requested) && requested > 0 ? requested : DEFAULT_MESSAGE_LIMIT;

    return this.gQueues.readMessages(queue, strategy || 'default', parsed);
  }

  /**
   * Runs a scheduled job now, through the scheduler's normal pipeline, and
   * answers once it finished. POST, because it changes something.
   *
   * @param name - Name of the job
   * @returns How the run ended, or why it could not start
   */
  @Post('/api/scheduler/run/:name')
  @SetHeader('Cache-Control', 'no-store')
  public runScheduledJob(@Param('name') name: string): Promise<SchedulerRunResult> {
    return this.gScheduler.run(name);
  }

  /**
   * Runs every health check now, past the cached report, and answers with the
   * `health` section as it stands afterwards. It reads the registry itself, so
   * it works with the probe routes off. POST, because it calls the backends
   * the checks watch.
   *
   * Callers that ask while a run is in progress share it, so several open
   * inspectors cost one round trip per backend. Outside the `ready` state
   * nothing runs, as with the readiness probe: a check may connect to its
   * backend, which is not this endpoint's to decide while the application
   * starts or drains.
   *
   * The run is recorded as a `health.check` trace with one event per check,
   * so it shows up next to the requests.
   *
   * @returns The health section with the fresh report
   */
  @Post('/api/health/check')
  @SetHeader('Cache-Control', 'no-store')
  public async runHealthChecks(): Promise<HealthTypes.Description> {
    let report: HealthTypes.Report | null = null;

    if (this.gLifecycle.state === 'ready') {
      this.fHealthRun ??= this.traceHealthRun().finally(() => {
        this.fHealthRun = null;
      });

      report = await this.fHealthRun;

      // other open inspectors learn that there is a newer report
      this.gIntrospection.touch('health');
    }

    const health = (await this.gIntrospection.describe<HealthTypes.Description>('health'))!.data;

    // the registry forgets a run the checks changed under; the caller still gets what it ran
    return health.report || !report ? health : { ...health, report };
  }

  /**
   * Runs the checks inside a span that carries the outcome.
   *
   * @returns The report
   */
  private traceHealthRun(): Promise<HealthTypes.Report> {
    return instrument.span('health.check', { kind: SpanKind.INTERNAL }, async (span) => {
      const report = await this.gHealth.check({ fresh: true });

      span.setAttribute('vercube.health.status', report.status);
      span.setAttribute('vercube.health.checks', Object.keys(report.checks).length);

      for (const [name, result] of Object.entries(report.checks)) {
        span.addEvent(name, {
          'vercube.health.check.status': result.status,
          'vercube.health.check.critical': result.critical,
          'vercube.health.check.duration_ms': result.duration,
          ...(result.error ? { 'vercube.health.check.error': result.error } : {}),
        });
      }

      if (report.status === 'down') {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'a critical health check failed' });
      }

      return report;
    });
  }

  /**
   * Returns the high-level application summary.
   *
   * @returns The overview
   */
  @Get('/api/overview')
  @SetHeader('Cache-Control', 'no-store')
  public overview(): Promise<DevtoolsTypes.Overview> {
    return this.gOverview.collect();
  }

  /**
   * Runs the audit rules.
   *
   * @returns Findings and a health score
   */
  @Get('/api/audit')
  @SetHeader('Cache-Control', 'no-store')
  public audit(): Promise<DevtoolsTypes.AuditReport> {
    return this.gAudit.run();
  }

  /**
   * Bundles everything into one downloadable file.
   *
   * @returns A JSON attachment
   */
  @Get('/api/snapshot')
  public async snapshot(): Promise<Response> {
    const payload = {
      generatedAt: new Date().toISOString(),
      protocol: DevtoolsProtocol.VERSION,
      overview: await this.gOverview.collect(),
      audit: await this.gAudit.run(),
      introspection: await this.gIntrospection.describeAll(),
      signals: {
        traces: this.gTelemetry.spans.snapshot(),
        metrics: this.gTelemetry.metrics.snapshot(),
        logs: this.gTelemetry.logs.snapshot(),
      },
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="vercube-devtools-snapshot.json"',
        'Cache-Control': 'no-store',
      },
    });
  }

  /**
   * Starts what every stream shares when the first one connects. The invalidate
   * listener and the ping publish to the bus, which reaches every stream, so
   * one of each serves them all; one per stream sent N copies to N tabs.
   *
   * @returns {void}
   */
  private connectStream(): void {
    if (this.fStreams++ > 0) {
      return;
    }

    // Structural sections are never pushed in full: a change only announces
    // itself, and the UI re-fetches the section it actually has open.
    this.fUnwatch = this.gIntrospection.onInvalidate((id, revision) => {
      this.gBus.publish<DevtoolsProtocol.InvalidatePayload>('introspect', { id, revision });
    });

    this.fPing = setInterval(() => {
      this.gBus.publish<DevtoolsProtocol.ControlPayload>('control', { type: 'ping' });
    }, PING_INTERVAL_MS);

    this.fPing.unref?.();
  }

  /**
   * Stops what every stream shares once the last one disconnects.
   *
   * @returns {void}
   */
  private disconnectStream(): void {
    if (--this.fStreams > 0) {
      return;
    }

    this.fUnwatch?.();
    this.fUnwatch = undefined;

    if (this.fPing) {
      clearInterval(this.fPing);
      this.fPing = undefined;
    }
  }

  /**
   * Streams frames to a connected UI.
   *
   * @returns A server-sent-events response
   */
  @Get('/api/stream')
  public stream(): Response {
    let unsubscribe: (() => void) | undefined;
    let connected = false;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();

        const send = (frame: DevtoolsProtocol.Frame): void => {
          controller.enqueue(encoder.encode(`event: frame\ndata: ${JSON.stringify(frame)}\n\n`));
        };

        unsubscribe = this.gBus.subscribe(send);

        // Sent straight to this connection rather than published: a greeting is
        // addressed to the client that just arrived, not to everyone watching.
        send({
          v: DevtoolsProtocol.VERSION,
          seq: 0,
          at: Date.now(),
          ch: 'control',
          data: {
            type: 'hello',
            path: this.gOptions.path,
            version: DevtoolsProtocol.VERSION,
            sections: this.gIntrospection.list().map((section) => section.id),
          } satisfies DevtoolsProtocol.ControlPayload,
        });

        this.connectStream();
        connected = true;

        this.gTelemetry.metrics.ensureRunning();
      },
      cancel: () => {
        unsubscribe?.();

        if (connected) {
          connected = false;
          this.disconnectStream();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      },
    });
  }

  /**
   * Rejects an unknown signal name.
   *
   * @param kind - The requested signal
   */
  private assertSignal(kind: string): void {
    if (!SIGNALS.has(kind)) {
      throw DevtoolsErrors.UNKNOWN_SIGNAL({ kind });
    }
  }
}
