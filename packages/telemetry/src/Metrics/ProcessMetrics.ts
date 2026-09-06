import { monitorEventLoopDelay } from 'node:perf_hooks';
import { performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { ValueType } from '@opentelemetry/api';
import type { Telemetry } from '../Common/Telemetry';
import type { BatchObservableResult, ObservableGauge } from '@opentelemetry/api';
import type { EventLoopUtilization, IntervalHistogram } from 'node:perf_hooks';

/**
 * Resolution of the event loop delay histogram, in milliseconds.
 *
 * Also the floor subtracted from every reading: `monitorEventLoopDelay`
 * schedules a timer every `resolution` ms and records how late it fired, so an
 * idle loop reports roughly one resolution rather than zero. Without the
 * subtraction a healthy server permanently claims ~10 ms of lag and any alert
 * on it cries wolf.
 */
const LOOP_RESOLUTION_MS = 10;

/** Nanoseconds per millisecond. */
const NS_PER_MS = 1e6;

/** Milliseconds per second. */
const MS_PER_SECOND = 1000;

/** Microseconds per millisecond, for the CPU counter. */
const US_PER_MS = 1000;

/**
 * Registers observable instruments describing the Node.js process.
 *
 * Everything here is an *observable* instrument, so nothing is measured until a
 * metric reader collects: with no reader registered the callbacks never run and
 * the event loop monitor is the only cost. That is the same "only sample while
 * someone is watching" property the devtools sampler had, without a bespoke
 * timer.
 *
 * @param telemetry - The telemetry facade whose meter the instruments belong to
 * @returns A function that unregisters the callback and stops the loop monitor
 */
export function installProcessMetrics(telemetry: Telemetry): () => void {
  const meter = telemetry.meter;

  const cpu = meter.createObservableGauge('process.cpu.utilization', {
    description: 'Process CPU usage since the previous collection, as a fraction of one core.',
    unit: '1',
    valueType: ValueType.DOUBLE,
  });

  const memory = meter.createObservableGauge('process.memory.usage', {
    description: 'Resident set size of the process.',
    unit: 'By',
    valueType: ValueType.INT,
  });

  const heapUsed = meter.createObservableGauge('v8js.memory.heap.used', {
    description: 'Heap memory currently in use.',
    unit: 'By',
    valueType: ValueType.INT,
  });

  const heapLimit = meter.createObservableGauge('v8js.memory.heap.limit', {
    description: 'Maximum heap size V8 will grow to.',
    unit: 'By',
    valueType: ValueType.INT,
  });

  const loopDelay = meter.createObservableGauge('nodejs.eventloop.delay.mean', {
    description: 'Mean event loop delay since the previous collection, with the sampling floor removed.',
    unit: 's',
    valueType: ValueType.DOUBLE,
  });

  const loopDelayP99 = meter.createObservableGauge('nodejs.eventloop.delay.p99', {
    description: '99th percentile event loop delay since the previous collection.',
    unit: 's',
    valueType: ValueType.DOUBLE,
  });

  const loopUtilization = meter.createObservableGauge('nodejs.eventloop.utilization', {
    description: 'Fraction of time the event loop was busy since the previous collection.',
    unit: '1',
    valueType: ValueType.DOUBLE,
  });

  const handles = meter.createObservableGauge('nodejs.process.handles', {
    description: 'Handles and requests keeping the process alive.',
    unit: '{handle}',
    valueType: ValueType.INT,
  });

  const sampler = new ProcessSampler();
  const instruments: ObservableGauge[] = [cpu, memory, heapUsed, heapLimit, loopDelay, loopDelayP99, loopUtilization, handles];

  const observe = (result: BatchObservableResult): void => {
    const reading = sampler.read();

    if (reading.cpu !== null) {
      result.observe(cpu, reading.cpu);
    }

    result.observe(memory, reading.rss);
    result.observe(heapUsed, reading.heapUsed);

    if (reading.heapLimit !== null) {
      result.observe(heapLimit, reading.heapLimit);
    }

    if (reading.loopDelayMeanSeconds !== null) {
      result.observe(loopDelay, reading.loopDelayMeanSeconds);
      result.observe(loopDelayP99, reading.loopDelayP99Seconds as number);
    }

    if (reading.loopUtilization !== null) {
      result.observe(loopUtilization, reading.loopUtilization);
    }

    if (reading.handles !== null) {
      result.observe(handles, reading.handles);
    }
  };

  meter.addBatchObservableCallback(observe, instruments);

  return () => {
    meter.removeBatchObservableCallback(observe, instruments);
    sampler.stop();
  };
}

/** One collection's worth of process state. */
interface ProcessReading {
  cpu: number | null;
  rss: number;
  heapUsed: number;
  heapLimit: number | null;
  loopDelayMeanSeconds: number | null;
  loopDelayP99Seconds: number | null;
  loopUtilization: number | null;
  handles: number | null;
}

/**
 * Reads process counters, turning the cumulative ones into per-collection rates.
 */
class ProcessSampler {
  /** CPU counter at the previous collection. */
  private fLastCpu: NodeJS.CpuUsage | null = null;

  /** Wall clock at the previous collection. */
  private fLastAt: number = Date.now();

  /** Event loop utilisation at the previous collection. */
  private fLastElu: EventLoopUtilization | null = null;

  /** Event loop delay histogram, reset after every reading. */
  private fLoop: IntervalHistogram | null = null;

  constructor() {
    this.fLastCpu = safely(() => process.cpuUsage());
    this.fLastElu = safely(() => performance.eventLoopUtilization());
    this.fLoop = safely(() => {
      const histogram = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
      histogram.enable();
      return histogram;
    });
  }

  /**
   * Takes one reading.
   *
   * @returns The current state of the process
   */
  public read(): ProcessReading {
    const usage = process.memoryUsage();

    return {
      cpu: this.readCpu(),
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapLimit: safely(() => getHeapStatistics().heap_size_limit),
      ...this.readLoop(),
      handles: safely(() => countHandles()),
    };
  }

  /**
   * Releases the event loop monitor.
   */
  public stop(): void {
    this.fLoop?.disable();
    this.fLoop = null;
  }

  /**
   * CPU time consumed since the previous reading, as a fraction of one core.
   *
   * @returns The utilisation, or null when the counter is unavailable
   */
  private readCpu(): number | null {
    const at = Date.now();
    const current = safely(() => process.cpuUsage());
    const previous = this.fLastCpu;
    const elapsedMs = at - this.fLastAt;

    this.fLastCpu = current;
    this.fLastAt = at;

    if (!current || !previous || elapsedMs <= 0) {
      return null;
    }

    const window = elapsedMs * US_PER_MS;

    return Math.max(0, (current.user - previous.user + (current.system - previous.system)) / window);
  }

  /**
   * Event loop delay and utilisation since the previous reading.
   *
   * @returns The loop portion of a reading
   */
  private readLoop(): Pick<ProcessReading, 'loopDelayMeanSeconds' | 'loopDelayP99Seconds' | 'loopUtilization'> {
    const histogram = this.fLoop;
    const previous = this.fLastElu;
    const current = safely(() => performance.eventLoopUtilization());

    this.fLastElu = current;

    if (!histogram) {
      return { loopDelayMeanSeconds: null, loopDelayP99Seconds: null, loopUtilization: null };
    }

    const meanMs = aboveFloor(histogram.mean / NS_PER_MS);
    const p99Ms = aboveFloor(histogram.percentile(99) / NS_PER_MS);

    histogram.reset();

    return {
      loopDelayMeanSeconds: meanMs / MS_PER_SECOND,
      loopDelayP99Seconds: p99Ms / MS_PER_SECOND,
      loopUtilization:
        current && previous ? (safely(() => performance.eventLoopUtilization(current, previous).utilization) ?? null) : null,
    };
  }
}

/**
 * Removes the sampling floor from an event loop delay reading.
 *
 * @param value - Raw reading in milliseconds
 * @returns The delay above the floor, never negative
 */
function aboveFloor(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value - LOOP_RESOLUTION_MS) : 0;
}

/**
 * Counts the handles and requests keeping the process alive.
 *
 * @returns The count
 */
function countHandles(): number {
  const scope = process as unknown as { _getActiveHandles?: () => unknown[]; _getActiveRequests?: () => unknown[] };

  return (scope._getActiveHandles?.().length ?? 0) + (scope._getActiveRequests?.().length ?? 0);
}

/**
 * Runs a counter read, turning an unsupported runtime into `null`.
 *
 * Bun and Deno do not implement every Node counter, and a missing gauge is
 * better than a crashed collection.
 *
 * @param fn - The read to attempt
 * @returns The value, or null when it threw
 */
function safely<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
