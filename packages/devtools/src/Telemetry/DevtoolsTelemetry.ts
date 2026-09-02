import { HTTP_ROUTE, URL_PATH } from '@vercube/telemetry';
import {
  addMetricReader,
  addSpanProcessor,
  ensureMeterProvider,
  ensureTracerProvider,
  resetTelemetryProviders,
} from '@vercube/telemetry/sdk';
import { DevtoolsFrameBus } from '../Services/DevtoolsFrameBus';
import { isUnderMount } from '../Utils/Mount';
import { DevtoolsLogDrain, DEVTOOLS_LOG_PLUGIN } from './DevtoolsLogDrain';
import { DevtoolsMetricPipeline } from './DevtoolsMetricPipeline';
import { DevtoolsSpanProcessor } from './DevtoolsSpanProcessor';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Logger } from '@vercube/logger';

/**
 * Everything devtools listens to, in one place.
 *
 * Devtools no longer collects anything itself: it registers an OpenTelemetry
 * span processor, a metric reader and an evlog drain, and renders whatever
 * arrives. The consequence worth noticing is that instrumenting a new package
 * makes it visible in devtools for free.
 */
export class DevtoolsTelemetry {
  /** Fan-out hub every collector publishes on. */
  public readonly bus: DevtoolsFrameBus;

  /** Records finished spans. */
  public readonly spans: DevtoolsSpanProcessor;

  /** Collects metrics while a UI is connected. */
  public readonly metrics: DevtoolsMetricPipeline;

  /** Records log events. */
  public readonly logs: DevtoolsLogDrain;

  /** Undo callbacks, run on {@link DevtoolsTelemetry.shutdown}. */
  private readonly fDetach: (() => void)[] = [];

  /** Whether the metric reader has already been registered. */
  private fMetricsInstalled = false;

  /**
   * @param options - Resolved devtools options
   */
  constructor(options: DevtoolsTypes.ResolvedOptions) {
    const bus = new DevtoolsFrameBus();

    this.bus = bus;
    this.spans = new DevtoolsSpanProcessor(bus, {
      maxSpans: options.maxRequests * 8,
      ignore: (span) => isDevtoolsTraffic(span, options.path),
    });

    this.metrics = new DevtoolsMetricPipeline(bus, { maxSamples: 120 });
    this.logs = new DevtoolsLogDrain(bus, { maxEvents: options.maxLogs });
  }

  /**
   * Registers the metric reader.
   *
   * Has to happen before any instrument is created: the OpenTelemetry metrics
   * API has no proxy meter, so instruments made before a provider exists are
   * permanently no-ops. That is why this runs in the plugin's config phase.
   */
  public installMetrics(): void {
    if (this.fMetricsInstalled) {
      return;
    }

    this.fMetricsInstalled = true;
    this.fDetach.push(addMetricReader(this.metrics.reader));
    ensureMeterProvider();
  }

  /**
   * Registers the span processor and the log drain.
   *
   * @param logger - The application logger
   */
  public install(logger: Logger | null): void {
    this.fDetach.push(addSpanProcessor(this.spans));

    // Creates a tracer provider only when the application has not already
    // started one; either way the processor above is attached to it.
    ensureTracerProvider();

    logger?.addDrain(DEVTOOLS_LOG_PLUGIN, this.logs.drain);
  }

  /**
   * Detaches everything and releases the metric reader.
   */
  public async shutdown(): Promise<void> {
    for (const detach of this.fDetach) {
      detach();
    }

    this.fDetach.length = 0;
    this.spans.clear();
    this.logs.clear();
    await this.metrics.shutdown();
  }
}

/**
 * Whether a span describes devtools' own HTTP traffic.
 *
 * Without this the inspector records itself: every poll of its own API becomes
 * a request in the list it is displaying.
 *
 * @param span - The finished span
 * @param mount - The devtools mount path
 * @returns True when the span should be dropped
 */
function isDevtoolsTraffic(span: ReadableSpan, mount: string): boolean {
  const path = span.attributes[URL_PATH] ?? span.attributes[HTTP_ROUTE];

  return typeof path === 'string' && isUnderMount(path, mount);
}

/** The process-wide pipeline. */
let current: DevtoolsTelemetry | null = null;

/**
 * Returns the devtools telemetry pipeline, creating it on first use.
 *
 * The pipeline has to survive between a plugin's config phase and its runtime
 * phase, and the framework builds a fresh plugin instance for each: whatever
 * the config phase set up on `this` is gone by the time `use()` runs. Holding
 * it here is what lets devtools start recording before the container exists.
 *
 * @param options - Resolved devtools options, used only on first call
 * @returns The pipeline
 */
export function ensureDevtoolsTelemetry(options: DevtoolsTypes.ResolvedOptions): DevtoolsTelemetry {
  current ??= new DevtoolsTelemetry(options);

  return current;
}

/**
 * Whether a pipeline already exists.
 *
 * @returns True when {@link ensureDevtoolsTelemetry} has run
 */
export function hasDevtoolsTelemetry(): boolean {
  return current !== null;
}

/**
 * Tears the pipeline down. Used between tests.
 */
export async function resetDevtoolsTelemetry(): Promise<void> {
  await current?.shutdown();
  current = null;

  await resetTelemetryProviders();
}
