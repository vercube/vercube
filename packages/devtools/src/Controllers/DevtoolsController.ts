import { Controller, Delete, Get, Middleware, NotFoundError, Param, QueryParam, SetHeader } from '@vercube/core';
import { Inject } from '@vercube/di';
import { DEFAULT_DEVTOOLS_OPTIONS } from '../Constants/DevtoolsDefaults';
import { DEVTOOLS_UI_HTML } from '../Generated/UI';
import { DevtoolsAuthMiddleware } from '../Middleware/DevtoolsAuthMiddleware';
import { AuditService } from '../Services/AuditService';
import { getBootstrapProfile } from '../Services/BootstrapProfiler';
import { ConfigCollector } from '../Services/ConfigCollector';
import { DevtoolsEventBus } from '../Services/DevtoolsEventBus';
import { GraphCollector } from '../Services/GraphCollector';
import { LogCollector } from '../Services/LogCollector';
import { OverviewCollector } from '../Services/OverviewCollector';
import { ProcessSampler } from '../Services/ProcessSampler';
import { RequestRecorder } from '../Services/RequestRecorder';
import { RouteCollector } from '../Services/RouteCollector';
import { StorageCollector } from '../Services/StorageCollector';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Interval between SSE keep-alive pings, in milliseconds. */
const PING_INTERVAL_MS = 20_000;

/**
 * Serves the devtools UI and its JSON API.
 * {@link DevtoolsPlugin} rewrites the base path before decorators initialise.
 */
@Controller(DEFAULT_DEVTOOLS_OPTIONS.path)
@Middleware(DevtoolsAuthMiddleware, { priority: -1000 })
export class DevtoolsController {
  @Inject($DevtoolsOptions)
  private readonly gOptions!: DevtoolsTypes.ResolvedOptions;

  @Inject(OverviewCollector)
  private readonly gOverview!: OverviewCollector;

  @Inject(GraphCollector)
  private readonly gGraph!: GraphCollector;

  @Inject(RouteCollector)
  private readonly gRoutes!: RouteCollector;

  @Inject(RequestRecorder)
  private readonly gRequests!: RequestRecorder;

  @Inject(AuditService)
  private readonly gAudit!: AuditService;

  @Inject(LogCollector)
  private readonly gLogs!: LogCollector;

  @Inject(ConfigCollector)
  private readonly gConfig!: ConfigCollector;

  @Inject(StorageCollector)
  private readonly gStorage!: StorageCollector;

  @Inject(ProcessSampler)
  private readonly gMetrics!: ProcessSampler;

  @Inject(DevtoolsEventBus)
  private readonly gEventBus!: DevtoolsEventBus;

  /**
   * Serves the single-file devtools UI.
   *
   * @returns an HTML response
   */
  @Get('/')
  public ui(): Response {
    return new Response(DEVTOOLS_UI_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  /**
   * @returns application identity, counts, memory and traffic summary
   */
  @Get('/api/overview')
  @SetHeader('Cache-Control', 'no-store')
  public overview(): DevtoolsTypes.Overview {
    return this.gOverview.collect();
  }

  /**
   * @returns the dependency injection graph
   */
  @Get('/api/graph')
  @SetHeader('Cache-Control', 'no-store')
  public graph(): DevtoolsTypes.Graph {
    return this.gGraph.collect();
  }

  /**
   * @returns every registered route
   */
  @Get('/api/routes')
  @SetHeader('Cache-Control', 'no-store')
  public routes(): DevtoolsTypes.RouteInfo[] {
    return this.gRoutes.collect();
  }

  /**
   * Resolves which route would handle a given method and path.
   *
   * @param method HTTP method to resolve
   * @param path pathname to resolve
   * @returns the matching route description
   * @throws {NotFoundError} when nothing matches
   */
  @Get('/api/route')
  @SetHeader('Cache-Control', 'no-store')
  public route(
    @QueryParam({ name: 'method' }) method: string,
    @QueryParam({ name: 'path' }) path: string,
  ): DevtoolsTypes.RouteInfo {
    const found = this.gRoutes.resolve(method || 'GET', path || '/');

    if (!found) {
      throw new NotFoundError('No route matches');
    }

    return found;
  }

  /**
   * @returns recorded requests, newest first
   */
  @Get('/api/requests')
  @SetHeader('Cache-Control', 'no-store')
  public requests(): DevtoolsTypes.RequestRecord[] {
    return this.gRequests.records;
  }

  /**
   * Drops every recorded request.
   *
   * @returns an acknowledgement
   */
  @Delete('/api/requests')
  @SetHeader('Cache-Control', 'no-store')
  public clearRequests(): { ok: boolean } {
    this.gRequests.clear();
    return { ok: true };
  }

  /**
   * @param id identifier of the recorded request
   * @returns the recorded request
   * @throws {NotFoundError} when the record has been evicted or never existed
   */
  @Get('/api/requests/:id')
  @SetHeader('Cache-Control', 'no-store')
  public request(@Param('id') id: string): DevtoolsTypes.RequestRecord {
    const record = this.gRequests.find(id);

    if (!record) {
      throw new NotFoundError('Request not found');
    }

    return record;
  }

  /**
   * @returns captured log lines, newest first
   */
  @Get('/api/logs')
  @SetHeader('Cache-Control', 'no-store')
  public logs(): DevtoolsTypes.LogEntry[] {
    return this.gLogs.entries;
  }

  /**
   * Drops every captured log line.
   *
   * @returns an acknowledgement
   */
  @Delete('/api/logs')
  @SetHeader('Cache-Control', 'no-store')
  public clearLogs(): { ok: boolean } {
    this.gLogs.clear();
    return { ok: true };
  }

  /**
   * Returns process metrics collected so far.
   * @returns the rolling window of process metrics
   */
  @Get('/api/metrics')
  @SetHeader('Cache-Control', 'no-store')
  public metrics(): DevtoolsTypes.MetricsSample[] {
    this.gMetrics.ensureRunning();
    return this.gMetrics.history;
  }

  /**
   * @returns the resolved application and runtime configuration
   */
  @Get('/api/config')
  @SetHeader('Cache-Control', 'no-store')
  public config(): DevtoolsTypes.ConfigView {
    return this.gConfig.collect();
  }

  /**
   * @returns mounted storages and the cache configuration
   */
  @Get('/api/storage')
  @SetHeader('Cache-Control', 'no-store')
  public storage(): Promise<DevtoolsTypes.StorageView> {
    return this.gStorage.collect();
  }

  /**
   * Reads a single value from a storage mount.
   * @param mount name of the mount to read from
   * @param key key to read
   * @returns a preview of the value
   */
  @Get('/api/storage/value')
  @SetHeader('Cache-Control', 'no-store')
  public storageValue(
    @QueryParam({ name: 'mount' }) mount: string,
    @QueryParam({ name: 'key' }) key: string,
  ): Promise<DevtoolsTypes.StorageValue> {
    return this.gStorage.readValue(mount || 'default', key);
  }

  /**
   * @returns the bootstrap call tree and its hotspots
   */
  @Get('/api/bootstrap')
  @SetHeader('Cache-Control', 'no-store')
  public bootstrap(): DevtoolsTypes.BootstrapProfile {
    return getBootstrapProfile();
  }

  /**
   * @returns audit findings and the health score
   */
  @Get('/api/audit')
  @SetHeader('Cache-Control', 'no-store')
  public audit(): DevtoolsTypes.AuditReport {
    return this.gAudit.run();
  }

  /**
   * Bundles all collected data into a downloadable JSON snapshot.
   * @returns a JSON attachment response
   */
  @Get('/api/snapshot')
  public snapshot(): Response {
    const payload = {
      generatedAt: new Date().toISOString(),
      overview: this.gOverview.collect(),
      graph: this.gGraph.collect(),
      routes: this.gRoutes.collect(),
      bootstrap: getBootstrapProfile(),
      audit: this.gAudit.run(),
      requests: this.gRequests.records,
      logs: this.gLogs.entries,
      config: this.gConfig.collect(),
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vercube-devtools-snapshot.json"',
        'Cache-Control': 'no-store',
      },
    });
  }

  /**
   * Opens a server-sent events stream pushing live request records.
   *
   * @returns an SSE response
   */
  @Get('/api/stream')
  public stream(): Response {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const send = (event: DevtoolsTypes.StreamEvent): void => {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
        };

        send({ type: 'hello', payload: { path: this.gOptions.path } });
        unsubscribe = this.gEventBus.subscribe(send);

        this.gMetrics.ensureRunning();

        ping = setInterval(() => {
          try {
            send({ type: 'ping', payload: { at: Date.now() } });
          } catch {
            /* stream already closed, cancel() takes care of the cleanup */
          }
        }, PING_INTERVAL_MS);
      },
      cancel: () => {
        unsubscribe?.();
        if (ping) {
          clearInterval(ping);
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }
}
