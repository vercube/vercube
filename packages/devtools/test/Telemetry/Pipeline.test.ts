import { SpanKind } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DevtoolsFrameBus } from '../../src/Services/DevtoolsFrameBus';
import { DevtoolsLogDrain } from '../../src/Telemetry/DevtoolsLogDrain';
import { DevtoolsMetricPipeline } from '../../src/Telemetry/DevtoolsMetricPipeline';
import { DevtoolsSpanProcessor } from '../../src/Telemetry/DevtoolsSpanProcessor';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { WideEvent } from '@vercube/logger';

/**
 * Builds a finished span shaped enough for the processor.
 *
 * @param name - Span name
 * @returns The span
 */
function span(name: string): ReadableSpan {
  return {
    name,
    kind: SpanKind.SERVER,
    attributes: {},
    status: { code: 0 },
    duration: [0, 1_000_000],
    startTime: [0, 0],
    endTime: [0, 1_000_000],
    events: [],
    links: [],
    resource: { attributes: {} },
    instrumentationScope: { name: 'test' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    ended: true,
    spanContext: () => ({ spanId: 'a'.repeat(16), traceId: 'b'.repeat(32), traceFlags: 1 }),
  } as unknown as ReadableSpan;
}

describe('DevtoolsSpanProcessor', () => {
  let bus: DevtoolsFrameBus;
  let processor: DevtoolsSpanProcessor;

  beforeEach(() => {
    bus = new DevtoolsFrameBus();
    processor = new DevtoolsSpanProcessor(bus, {
      maxSpans: 2,
      ignore: (candidate) => candidate.name === 'ignored',
    });
  });

  it('starts empty and serialises to an empty export request', () => {
    expect(processor.spans()).toEqual([]);
    expect(processor.snapshot()).toEqual({ resourceSpans: [] });
  });

  it('keeps finished spans newest first', () => {
    processor.onEnd(span('first'));
    processor.onEnd(span('second'));

    expect(processor.spans().map((entry) => entry.name)).toEqual(['second', 'first']);
  });

  it('drops the oldest span past the buffer size', () => {
    processor.onEnd(span('a'));
    processor.onEnd(span('b'));
    processor.onEnd(span('c'));

    expect(processor.spans().map((entry) => entry.name)).toEqual(['c', 'b']);
  });

  it('never records what it was told to ignore', () => {
    processor.onEnd(span('ignored'));

    expect(processor.spans()).toEqual([]);
  });

  it('does nothing on start, because only finished work is shown', () => {
    expect(() => processor.onStart({} as never, {} as never)).not.toThrow();
  });

  it('publishes a batch once someone is listening', async () => {
    const frames: unknown[] = [];
    bus.subscribe((frame) => frames.push(frame));

    processor.onEnd(span('watched'));
    await processor.forceFlush();

    expect(frames).toHaveLength(1);
  });

  it('empties on clear and on shutdown', async () => {
    processor.onEnd(span('a'));
    processor.clear();

    expect(processor.spans()).toEqual([]);

    processor.onEnd(span('b'));
    await processor.shutdown();

    expect(processor.spans()).toEqual([]);
  });
});

describe('DevtoolsLogDrain', () => {
  it('keeps recent events and serialises them as OTLP', () => {
    const bus = new DevtoolsFrameBus();
    const drain = new DevtoolsLogDrain(bus, { maxEvents: 1 });

    drain.drain({ event: { message: 'first', level: 'info', service: 'app' } as unknown as WideEvent });
    drain.drain({ event: { message: 'second', level: 'info', service: 'app' } as unknown as WideEvent });

    const snapshot = drain.snapshot() as { resourceLogs: { scopeLogs: { logRecords: unknown[] }[] }[] };

    expect(snapshot.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(1);

    drain.clear();
    expect(drain.snapshot()).toEqual({ resourceLogs: [] });
  });
});

describe('DevtoolsMetricPipeline', () => {
  let bus: DevtoolsFrameBus;
  let pipeline: DevtoolsMetricPipeline;

  beforeEach(() => {
    bus = new DevtoolsFrameBus();
    pipeline = new DevtoolsMetricPipeline(bus, { maxSamples: 2 });
  });

  it('exposes a reader and an empty snapshot', () => {
    expect(pipeline.reader).toBeDefined();
    expect(pipeline.snapshot()).toEqual({ resourceMetrics: [] });
  });

  it('starts collecting only once', () => {
    const timer = vi.spyOn(globalThis, 'setInterval');

    pipeline.ensureRunning();
    pipeline.ensureRunning();

    expect(timer).toHaveBeenCalledTimes(1);
    timer.mockRestore();
    pipeline.stop();
  });

  it('stops collecting when nobody is listening', async () => {
    pipeline.ensureRunning();
    // Collecting with no audience would reset the event loop histogram behind
    // a real reader's back, so the timer shuts itself down instead.
    await pipeline.collectNow();
    pipeline.stop();

    expect(pipeline.snapshot()).toEqual({ resourceMetrics: [] });
  });

  it('releases the reader on shutdown', async () => {
    pipeline.clear();
    await expect(pipeline.shutdown()).resolves.toBeUndefined();
  });
});
