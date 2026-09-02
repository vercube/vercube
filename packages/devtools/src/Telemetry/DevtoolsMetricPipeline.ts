import { JsonMetricsSerializer } from '@opentelemetry/otlp-transformer';
import { AggregationTemporality, InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { DevtoolsFrameBus } from '../Services/DevtoolsFrameBus';
import type { IMetricReader, ResourceMetrics } from '@opentelemetry/sdk-metrics';

/** How often metrics are collected while a UI is connected, in milliseconds. */
const COLLECT_INTERVAL_MS = 2000;

/**
 * A reader interval long enough that the timer never fires on its own.
 * Collection is driven by {@link DevtoolsMetricPipeline}, not by the reader.
 */
const NEVER_MS = 2_147_483_647;

/**
 * Collects OpenTelemetry metrics on a timer and streams them to connected UIs.
 *
 * Collection only runs while someone is watching. That is not just tidiness:
 * the process gauges read the event loop delay histogram and reset it, so
 * collecting when nobody is looking would quietly change what the next real
 * reader sees.
 */
export class DevtoolsMetricPipeline {
  /** Where collected batches are published. */
  private readonly fBus: DevtoolsFrameBus;

  /** Exporter holding the most recent collections. */
  private readonly fExporter: InMemoryMetricExporter;

  /** The reader registered with the meter provider. */
  private readonly fReader: PeriodicExportingMetricReader;

  /** Rolling window of collected batches, oldest first. */
  private fHistory: ResourceMetrics[] = [];

  /** How many batches the window keeps. */
  private readonly fMaxSamples: number;

  /** Collection timer, running only while a UI is connected. */
  private fTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param bus - Frame bus to publish batches on
   * @param options - Size of the rolling window
   */
  constructor(bus: DevtoolsFrameBus, options: { maxSamples: number }) {
    this.fBus = bus;
    this.fMaxSamples = options.maxSamples;
    this.fExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    this.fReader = new PeriodicExportingMetricReader({
      exporter: this.fExporter,
      exportIntervalMillis: NEVER_MS,
    });
  }

  /**
   * The reader to hand to the meter provider.
   *
   * @returns The metric reader
   */
  public get reader(): IMetricReader {
    return this.fReader;
  }

  /**
   * Collected batches, oldest first, as an OTLP/JSON export request.
   *
   * @returns The OTLP payload
   */
  public snapshot(): unknown {
    return toOtlpJson(this.fHistory);
  }

  /**
   * Starts collecting if it is not already running.
   */
  public ensureRunning(): void {
    if (this.fTimer) {
      return;
    }

    this.fTimer = setInterval(() => {
      void this.collect();
    }, COLLECT_INTERVAL_MS);

    this.fTimer.unref?.();
  }

  /**
   * Stops collecting.
   */
  public stop(): void {
    if (this.fTimer) {
      clearInterval(this.fTimer);
      this.fTimer = null;
    }
  }

  /** Empties the rolling window. */
  public clear(): void {
    this.fHistory = [];
    this.fExporter.reset();
  }

  /**
   * Releases the reader.
   */
  public async shutdown(): Promise<void> {
    this.stop();
    await this.fReader.shutdown();
  }

  /**
   * Takes one collection immediately, regardless of who is listening.
   *
   * The timer only runs while a UI is connected, so a plain snapshot request
   * would otherwise come back empty on a freshly opened panel.
   *
   * @returns Resolves once the collection has been recorded
   */
  public async collectNow(): Promise<void> {
    await this.collect(true);
  }

  /**
   * Takes one collection and publishes it, stopping when nobody is listening.
   *
   * @param force - Collect even without subscribers
   */
  private async collect(force = false): Promise<void> {
    if (!force && this.fBus.size === 0) {
      this.stop();
      return;
    }

    this.fExporter.reset();
    await this.fReader.forceFlush();

    const collected = this.fExporter.getMetrics();

    if (collected.length === 0) {
      return;
    }

    this.fHistory.push(...collected);

    while (this.fHistory.length > this.fMaxSamples) {
      this.fHistory.shift();
    }

    this.fBus.publish('metric', toOtlpJson(collected));
  }
}

/**
 * Converts collected metrics into an OTLP/JSON export request.
 *
 * @param batches - The collections to serialise
 * @returns The parsed OTLP payload
 */
function toOtlpJson(batches: ResourceMetrics[]): unknown {
  if (batches.length === 0) {
    return { resourceMetrics: [] };
  }

  const merged = batches.flatMap((batch) => {
    const bytes = JsonMetricsSerializer.serializeRequest(batch);
    const parsed = bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as { resourceMetrics?: unknown[] }) : undefined;

    return parsed?.resourceMetrics ?? [];
  });

  return { resourceMetrics: merged };
}
