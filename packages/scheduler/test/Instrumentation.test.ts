import { Container } from '@vercube/di';
import { QueueManager } from '@vercube/queue';
import { MemoryStrategy } from '@vercube/queue/strategies/MemoryStrategy';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchedulerManager } from '../src/Services/SchedulerManager';
import { MemoryStore } from '../src/Stores/MemoryStore';
import { ManualClock } from '../src/Testing/ManualClock';
import { createReplica } from './Utils/Harness';
import type { TestTelemetry } from '@vercube/telemetry/testing';

let telemetry: TestTelemetry;

/**
 * Reads a metric's data points out of the collected metrics.
 *
 * @param collected - What the meter provider reported
 * @param name - Name of the instrument
 * @returns Its data points
 */
function points(
  collected: Awaited<ReturnType<TestTelemetry['collect']>>,
  name: string,
): { value: number | { count: number; sum: number }; attributes: Record<string, unknown> }[] {
  return collected
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
    .flatMap((metric) => metric.dataPoints as { value: number; attributes: Record<string, unknown> }[]);
}

describe('scheduler instrumentation', () => {
  let clock: ManualClock;
  let store: MemoryStore;

  beforeEach(() => {
    telemetry ??= createTestTelemetry();
    clock = new ManualClock('2026-01-01T00:00:30Z');
    store = new MemoryStore();
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await telemetry.shutdown();
  });

  it('traces a run with the job, its occurrence and how it ended', async () => {
    const { manager } = await createReplica({ clock, instanceId: 'pod-a' }, store);

    manager.add({ name: 'reports.build', schedule: { every: '1m' }, handler: () => {} });
    await manager.start();
    await clock.advance('1m');

    const span = telemetry.span('scheduler.run reports.build');

    expect(span).toBeDefined();
    expect(span!.kind).toBe(0); // INTERNAL
    expect(span!.attributes).toEqual({
      'vercube.scheduler.job': 'reports.build',
      'vercube.scheduler.scope': 'cluster',
      'vercube.scheduler.trigger': 'timer',
      'vercube.scheduler.scheduled_at': '2026-01-01T00:01:00.000Z',
      'vercube.scheduler.instance': 'pod-a',
      'vercube.scheduler.outcome': 'completed',
      'vercube.scheduler.attempt': 1,
    });
    expect(span!.status.code).toBe(0); // UNSET
  });

  it('fails the span of a failed run', async () => {
    const { manager } = await createReplica({ clock }, store);

    manager.add({
      name: 'broken',
      schedule: { every: '1m' },
      handler: () => {
        throw new TypeError('boom');
      },
    });
    await manager.trigger('broken');

    const span = telemetry.span('scheduler.run broken')!;

    expect(span.status).toEqual({ code: 2, message: 'boom' }); // ERROR
    expect(span.attributes['error.type']).toBe('TypeError');
    expect(span.attributes['vercube.scheduler.outcome']).toBe('failed');
  });

  it('opens no span for an occurrence another replica claimed, but counts it', async () => {
    const a = await createReplica({ clock, instanceId: 'a' }, store);
    const b = await createReplica({ clock, instanceId: 'b' }, store);

    for (const { manager } of [a, b]) {
      manager.add({ name: 'report', schedule: { every: '1m' }, handler: () => {} });
      await manager.start();
    }

    await clock.advance('3m');

    expect(telemetry.spans().filter((span) => span.name === 'scheduler.run report')).toHaveLength(3);

    const runs = points(await telemetry.collect(), 'vercube.scheduler.runs');

    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 3,
          attributes: { 'vercube.scheduler.job': 'report', 'vercube.scheduler.outcome': 'completed' },
        }),
        expect.objectContaining({
          value: 3,
          attributes: { 'vercube.scheduler.job': 'report', 'vercube.scheduler.outcome': 'skipped-claimed' },
        }),
      ]),
    );
  });

  it('records how long runs took and how late they started', async () => {
    const { manager } = await createReplica({ clock }, store);

    manager.add({ name: 'slow', schedule: { every: '1m' }, handler: () => clock.sleep('2s') });
    await manager.start();
    clock.set('2026-01-01T00:01:05Z');
    await clock.advance('5s');

    const collected = await telemetry.collect();
    const of = (name: string) => points(collected, name).filter((point) => point.attributes['vercube.scheduler.job'] === 'slow');
    const [duration] = of('vercube.scheduler.duration');
    const [lag] = of('vercube.scheduler.lag');

    expect(duration.attributes).toEqual({ 'vercube.scheduler.job': 'slow', 'vercube.scheduler.outcome': 'completed' });
    expect(duration.value).toMatchObject({ count: 1, sum: 2000 });
    expect(lag.attributes).toEqual({ 'vercube.scheduler.job': 'slow' });
    expect(lag.value).toMatchObject({ count: 1, sum: 5000 });
  });

  it('counts missed occurrences', async () => {
    const { manager } = await createReplica({ clock }, store);

    manager.add({ name: 'late', schedule: { every: '1m' }, scope: 'instance', misfireGrace: '1s', handler: () => {} });
    await manager.start();
    clock.set('2026-01-01T00:01:30Z');
    await clock.advance();

    expect(
      points(await telemetry.collect(), 'vercube.scheduler.runs').filter(
        (point) => point.attributes['vercube.scheduler.job'] === 'late',
      ),
    ).toEqual([
      expect.objectContaining({
        value: 1,
        attributes: { 'vercube.scheduler.job': 'late', 'vercube.scheduler.outcome': 'missed' },
      }),
    ]);
  });

  it('puts the queue publish of a queue target inside the run span', async () => {
    const container = new Container();

    container.bindInstance(Container, container);
    container.bind(SchedulerManager);
    container.bind(QueueManager);

    const queue = container.get(QueueManager);
    const scheduler = container.get(SchedulerManager);

    queue.configure({ autoStart: false });
    await queue.mount({ strategy: MemoryStrategy });
    scheduler.configure({ autoStart: false, clock });
    await scheduler.mount({ store });
    scheduler.add({ name: 'reports.build', schedule: { every: '1m' }, target: { queue: 'reports' }, handler: () => {} });
    await scheduler.start();
    await scheduler.trigger('reports.build');

    const run = telemetry.span('scheduler.run reports.build')!;
    const publish = telemetry.span('queue.publish reports')!;

    expect(run.attributes['vercube.scheduler.outcome']).toBe('enqueued');
    expect(publish.parentSpanContext?.spanId).toBe(run.spanContext().spanId);

    await scheduler.close();
    await queue.close();
  });
});
