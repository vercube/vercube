import { Container } from '@vercube/di';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueueManager } from '../src/Services/QueueManager';
import { RecordingStrategy, registration } from './Utils/Mock.mock';
import type { TestTelemetry } from '@vercube/telemetry/testing';

let telemetry: TestTelemetry;
let container: Container;
let manager: QueueManager;
let strategy: RecordingStrategy;

/**
 * Reads a counter's data points out of the collected metrics.
 *
 * @param collected - What the meter provider reported
 * @param name - Name of the instrument
 * @returns Its data points, newest batch first
 */
function points(
  collected: Awaited<ReturnType<TestTelemetry['collect']>>,
  name: string,
): { value: number; attributes: Record<string, unknown> }[] {
  return collected
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
    .flatMap((metric) => metric.dataPoints as { value: number; attributes: Record<string, unknown> }[]);
}

describe('queue instrumentation', () => {
  beforeEach(async () => {
    telemetry ??= createTestTelemetry();

    container = new Container();
    container.bindInstance(Container, container);

    manager = container.resolve(QueueManager);
    manager.configure({ autoStart: false });

    await manager.mount({ strategy: RecordingStrategy });
    strategy = manager.getStrategy() as RecordingStrategy;
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await telemetry.shutdown();
  });

  it('traces publishing a job', async () => {
    await manager.add({ queue: 'emails', job: 'welcome', payload: { id: 1 } });

    const span = telemetry.span('queue.publish emails');

    expect(span).toBeDefined();
    expect(span!.kind).toBe(3); // PRODUCER
    expect(span!.attributes).toMatchObject({
      'vercube.queue.strategy': 'default',
      'vercube.queue.name': 'emails',
      'vercube.queue.job': 'welcome',
      'vercube.queue.batch': 1,
    });
  });

  it('reports the batch size when publishing many', async () => {
    await manager.addMany({ queue: 'emails', job: 'welcome', payloads: [{ id: 1 }, { id: 2 }] });

    expect(telemetry.span('queue.publish emails')!.attributes['vercube.queue.batch']).toBe(2);
  });

  it('fails the publish span when the transport refuses', async () => {
    strategy.publishError = new Error('broker down');

    await expect(manager.add({ queue: 'emails', job: 'welcome', payload: {} })).rejects.toThrow();

    const span = telemetry.span('queue.publish emails')!;

    expect(span.status.code).toBe(2); // ERROR
    // The manager wraps transport failures, and the span reports what actually
    // propagated to the caller.
    expect(span.attributes['error.type']).toBe('QueueError');
  });

  it('carries the publishing trace into the job headers', async () => {
    await manager.add({ queue: 'emails', job: 'welcome', payload: {} });

    const published = strategy.published[0];
    const span = telemetry.span('queue.publish emails')!;

    expect(published.headers.traceparent).toContain(span.spanContext().traceId);
  });

  it('parents the consumer span on the publisher, across the transport', async () => {
    manager.registerConsumer(registration());
    await manager.start();

    await manager.add({ queue: 'emails', job: 'welcome', payload: {} });

    const publish = telemetry.span('queue.publish emails')!;

    await strategy.deliver('emails', { job: 'welcome', headers: strategy.published[0].headers });

    const process = telemetry.span('queue.process emails.welcome')!;

    expect(process.kind).toBe(4); // CONSUMER
    expect(process.spanContext().traceId).toBe(publish.spanContext().traceId);
    expect(process.parentSpanContext?.spanId).toBe(publish.spanContext().spanId);
    expect(process.attributes).toMatchObject({ 'vercube.queue.attempt': 1, 'vercube.queue.outcome': 'completed' });
  });

  it('starts its own trace for a job that carries none', async () => {
    manager.registerConsumer(registration());
    await manager.start();

    await strategy.deliver('emails', { job: 'welcome' });

    const span = telemetry.span('queue.process emails.welcome')!;

    expect(span).toBeDefined();
    expect(span.parentSpanContext).toBeUndefined();
  });

  it('records a failing handler on the consumer span', async () => {
    manager.registerConsumer(registration({ handler: () => Promise.reject(new TypeError('nope')) }));
    await manager.start();

    await expect(strategy.deliver('emails', { job: 'welcome' })).rejects.toThrow('nope');

    const span = telemetry.span('queue.process emails.welcome')!;

    expect(span.status.code).toBe(2);
    expect(span.attributes['error.type']).toBe('TypeError');
    expect(span.attributes['vercube.queue.outcome']).toBe('failed');
  });

  it('marks a job nothing handles', async () => {
    manager.registerConsumer(registration());
    await manager.start();

    await strategy.deliver('emails', { job: 'unknown' });

    expect(telemetry.span('queue.process emails.unknown')!.attributes['vercube.queue.outcome']).toBe('unhandled');
  });

  it('counts published jobs and their outcomes', async () => {
    manager.registerConsumer(registration());
    await manager.start();

    await manager.add({ queue: 'emails', job: 'welcome', payload: {} });
    await strategy.deliver('emails', { job: 'welcome' });

    const collected = await telemetry.collect();

    expect(
      points(collected, 'vercube.queue.published').some(
        (point) => point.attributes['vercube.queue.name'] === 'emails' && point.attributes['vercube.queue.job'] === 'welcome',
      ),
    ).toBe(true);
    expect(
      points(collected, 'vercube.queue.processed').some((point) => point.attributes['vercube.queue.outcome'] === 'completed'),
    ).toBe(true);
  });
});
