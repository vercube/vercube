import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { Inject } from '@vercube/di';
import { DevtoolsEventBus } from './DevtoolsEventBus';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { EventLoopUtilization, IntervalHistogram } from 'node:perf_hooks';

/** Sampling interval while a stream is open, in milliseconds. */
const INTERVAL_MS = 2000;

/** Number of samples kept in the rolling window. */
const HISTORY = 120;

/** Nanoseconds per millisecond. */
const NS_PER_MS = 1e6;

/**
 * Event loop delay histogram resolution in milliseconds.
 * Also used as the sampling floor subtracted from readings.
 */
const LOOP_RESOLUTION_MS = 10;

/**
 * Samples process metrics and pushes readings to connected UIs.
 * Runs only while a devtools stream is open. Missing counters are reported as null.
 */
export class ProcessSampler {
  @Inject(DevtoolsEventBus)
  private readonly gEventBus!: DevtoolsEventBus;

  /** Rolling window of readings, oldest first. */
  private fHistory: DevtoolsTypes.MetricsSample[] = [];

  private fTimer: ReturnType<typeof setInterval> | null = null;

  /** CPU counter at the previous sample. */
  private fLastCpu: NodeJS.CpuUsage | null = null;

  /** Wall clock at the previous sample. */
  private fLastAt: number = 0;

  /** Event loop utilisation at the previous sample. */
  private fLastElu: EventLoopUtilization | null = null;

  /** Event loop delay histogram, reset after every reading. */
  private fLoop: IntervalHistogram | null = null;

  /**
   * Readings collected so far, oldest first.
   * @returns a snapshot of the rolling window
   */
  public get history(): DevtoolsTypes.MetricsSample[] {
    return [...this.fHistory];
  }

  /**
   * Starts sampling if it is not already running.
   */
  public ensureRunning(): void {
    if (this.fTimer) {
      return;
    }

    this.fLastCpu = this.readCpuCounter();
    this.fLastAt = Date.now();
    this.fLastElu = this.readUtilisation();
    this.fLoop = this.startLoopMonitor();

    this.fTimer = setInterval(() => this.tick(), INTERVAL_MS);
    this.fTimer.unref?.();
  }

  /**
   * Stops sampling and releases the event loop monitor.
   */
  public stop(): void {
    if (this.fTimer) {
      clearInterval(this.fTimer);
      this.fTimer = null;
    }

    this.fLoop?.disable();
    this.fLoop = null;
    this.fLastCpu = null;
    this.fLastElu = null;
  }

  /**
   * Takes one reading, broadcasts it, and stops when no subscribers remain.
   */
  private tick(): void {
    if (this.gEventBus.size === 0) {
      this.stop();
      return;
    }

    const sample = this.sample();

    this.fHistory.push(sample);

    while (this.fHistory.length > HISTORY) {
      this.fHistory.shift();
    }

    this.gEventBus.publish({ type: 'metrics', payload: sample });
  }

  /**
   * Builds one reading.
   * @returns the current state of the process
   */
  private sample(): DevtoolsTypes.MetricsSample {
    const at = Date.now();

    return {
      at,
      cpu: this.readCpu(at),
      memory: this.readMemory(),
      loop: this.readLoop(),
      resources: this.readResources(),
    };
  }

  /**
   * Turns CPU time since the last sample into a share of one core.
   * @param at wall clock of this sample
   * @returns CPU usage in percent, or null when unavailable
   */
  private readCpu(at: number): DevtoolsTypes.MetricsSample['cpu'] {
    const current = this.readCpuCounter();
    const previous = this.fLastCpu;
    const elapsedMs = at - this.fLastAt;

    this.fLastCpu = current;
    this.fLastAt = at;

    if (!current || !previous || elapsedMs <= 0) {
      return null;
    }

    // cpuUsage is in microseconds.
    const window = elapsedMs * 1000;
    const user = ((current.user - previous.user) / window) * 100;
    const system = ((current.system - previous.system) / window) * 100;

    return {
      user: Math.max(0, Math.round(user * 10) / 10),
      system: Math.max(0, Math.round(system * 10) / 10),
      total: Math.max(0, Math.round((user + system) * 10) / 10),
    };
  }

  /**
   * @returns the CPU counter, or null when unavailable
   */
  private readCpuCounter(): NodeJS.CpuUsage | null {
    try {
      return process.cpuUsage();
    } catch {
      return null;
    }
  }

  /**
   * @returns current memory usage
   */
  private readMemory(): DevtoolsTypes.MetricsSample['memory'] {
    const usage = process.memoryUsage();

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      heapLimit: this.readHeapLimit(),
      rss: usage.rss,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers ?? 0,
    };
  }

  /**
   * @returns the maximum heap size V8 will grow to, or null when unavailable
   */
  private readHeapLimit(): number | null {
    try {
      return getHeapStatistics().heap_size_limit;
    } catch {
      return null;
    }
  }

  /**
   * Reads and resets the event loop delay histogram.
   * @returns event loop delay and utilisation, or null when not measurable
   */
  private readLoop(): DevtoolsTypes.MetricsSample['loop'] {
    const histogram = this.fLoop;

    if (!histogram) {
      return null;
    }

    try {
      const meanMs = this.aboveFloor(histogram.mean);
      const p99Ms = this.aboveFloor(histogram.percentile(99));
      histogram.reset();

      const current = this.readUtilisation();
      const utilization = current && this.fLastElu ? performance.eventLoopUtilization(current, this.fLastElu).utilization : 0;
      this.fLastElu = current;

      return {
        meanMs,
        p99Ms,
        utilization: Math.round(utilization * 1000) / 10,
      };
    } catch {
      return null;
    }
  }

  /**
   * Strips the histogram sampling floor from a reading.
   * @param nanoseconds raw histogram value
   * @returns delay above the floor in milliseconds
   */
  private aboveFloor(nanoseconds: number): number {
    const ms = nanoseconds / NS_PER_MS;

    if (!Number.isFinite(ms)) {
      return 0;
    }

    return Math.max(0, Math.round((ms - LOOP_RESOLUTION_MS) * 100) / 100);
  }

  /**
   * @returns a running event loop delay monitor, or null when unsupported
   */
  private startLoopMonitor(): IntervalHistogram | null {
    try {
      const histogram = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
      histogram.enable();
      return histogram;
    } catch {
      return null;
    }
  }

  /**
   * @returns the current event loop utilisation, or null when unsupported
   */
  private readUtilisation(): EventLoopUtilization | null {
    try {
      return performance.eventLoopUtilization();
    } catch {
      return null;
    }
  }

  /**
   * Counts active resources keeping the process alive, grouped by kind.
   * @returns active resources by kind, or null when unavailable
   */
  private readResources(): DevtoolsTypes.MetricsSample['resources'] {
    try {
      const active = (process as { getActiveResourcesInfo?: () => string[] }).getActiveResourcesInfo?.();

      if (!active) {
        return null;
      }

      const kinds: Record<string, number> = {};

      for (const kind of active) {
        kinds[kind] = (kinds[kind] ?? 0) + 1;
      }

      return { total: active.length, kinds };
    } catch {
      return null;
    }
  }
}
