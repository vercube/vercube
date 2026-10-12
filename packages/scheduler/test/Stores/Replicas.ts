import { expect, it } from 'vitest';
import { ManualClock } from '../../src/Testing/ManualClock';
import { createReplica, outcomes } from '../Utils/Harness';
import type { SchedulerStore } from '../../src/Services/SchedulerStore';

/**
 * Two replicas, each with its own connection to the same backend, run every
 * occurrence of a cluster job exactly once.
 *
 * @param createStore - Creates a store connected to the shared backend, under a key space shared by both calls
 */
export function runReplicaCheck(createStore: () => Promise<{ store: SchedulerStore<any>; initOptions: unknown }>): void {
  it('runs every occurrence once across two replicas with their own connections', async () => {
    const clock = new ManualClock('2026-01-01T00:00:30Z');
    const runs: string[] = [];
    const replicas = [];

    for (const instanceId of ['a', 'b']) {
      const { store, initOptions } = await createStore();
      const replica = await createReplica({ clock, instanceId }, { store, initOptions });

      // the manual clock cannot see real network round trips, so it may move on
      // while a release is in flight; only the occurrence claims are under test here
      replica.manager.add({
        name: 'report',
        schedule: { every: '1m' },
        overlap: 'allow',
        handler: (ctx) => void runs.push(ctx.occurrenceId),
      });
      await replica.manager.start();
      replicas.push(replica);
    }

    await clock.advance('20m');

    for (const replica of replicas) {
      await replica.manager.drain();
    }

    expect(runs).toHaveLength(20);
    expect(new Set(runs).size).toBe(20);
    expect(outcomes(replicas.flatMap((replica) => replica.events))).toEqual({ completed: 20, 'skipped-claimed': 20 });

    for (const replica of replicas) {
      await replica.manager.close();
    }
  });
}
