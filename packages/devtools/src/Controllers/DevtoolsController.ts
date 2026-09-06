import {
  Controller,
  Get,
  Header,
  IntrospectionRegistry,
  Middleware,
  NotFoundError,
  Param,
  QueryParam,
  SetHeader,
} from '@vercube/core';
import { Inject } from '@vercube/di';
import { DEFAULT_DEVTOOLS_OPTIONS } from '../Constants/DevtoolsDefaults';
import { DEVTOOLS_UI_HTML } from '../Generated/UI';
import { DevtoolsAuthMiddleware } from '../Middleware/DevtoolsAuthMiddleware';
import { DevtoolsProtocol } from '../Protocol/Frames';
import { AuditService } from '../Services/AuditService';
import { DevtoolsFrameBus } from '../Services/DevtoolsFrameBus';
import { OverviewCollector } from '../Services/OverviewCollector';
import { StorageIntrospection } from '../Services/StorageIntrospection';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import { DevtoolsTelemetry } from '../Telemetry/DevtoolsTelemetry';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Interval between keep-alive frames, in milliseconds. */
const PING_INTERVAL_MS = 20_000;

/** Signal buffers a client can read or clear. */
const SIGNALS = new Set(['traces', 'metrics', 'logs']);

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

  @Inject(DevtoolsFrameBus)
  private readonly gBus!: DevtoolsFrameBus;

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
      throw new NotFoundError(`Unknown introspection section: ${id}`);
    }

    const etag = `"${section.revision}"`;

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
   * Empties a signal buffer.
   *
   * @param kind - `traces`, `metrics` or `logs`
   * @returns Acknowledgement
   */
  @Get('/api/signals/:kind/clear')
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
   * Streams frames to a connected UI.
   *
   * @returns A server-sent-events response
   */
  @Get('/api/stream')
  public stream(): Response {
    let unsubscribe: (() => void) | undefined;
    let unwatch: (() => void) | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

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

        // Structural sections are never pushed in full: a change only announces
        // itself, and the UI re-fetches the section it actually has open.
        unwatch = this.gIntrospection.onInvalidate((id, revision) => {
          this.gBus.publish<DevtoolsProtocol.InvalidatePayload>('introspect', { id, revision });
        });

        this.gTelemetry.metrics.ensureRunning();

        ping = setInterval(() => {
          this.gBus.publish<DevtoolsProtocol.ControlPayload>('control', { type: 'ping' });
        }, PING_INTERVAL_MS);

        ping.unref?.();
      },
      cancel: () => {
        unsubscribe?.();
        unwatch?.();

        if (ping) {
          clearInterval(ping);
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
      throw new NotFoundError(`Unknown signal: ${kind}`);
    }
  }
}
