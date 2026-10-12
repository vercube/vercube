import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTable, listJobs, runJob } from '../../src/Commands/Actions';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { createReplica } from '../Utils/Harness';
import type { Replica } from '../Utils/Harness';

describe('CLI actions', () => {
  let clock: ManualClock;
  let store: MemoryStore;
  let replica: Replica;

  beforeEach(async () => {
    clock = new ManualClock('2026-01-01T03:00:02Z');
    store = new MemoryStore();
    replica = await createReplica({ clock, instanceId: 'cron-pod' }, store);
  });

  it('lists every job with its next three runs', () => {
    replica.manager.add({
      name: 'billing.close-day',
      schedule: { cron: '0 3 * * *', timezone: 'Europe/Warsaw' },
      handler: () => {},
    });
    replica.manager.add({ name: 'cache.flush', schedule: { every: '5m' }, scope: 'instance', handler: () => {} });
    replica.manager.add({ name: 'reports.build', schedule: { every: '1h' }, target: { queue: 'reports' }, handler: () => {} });
    replica.manager.add({ name: 'manual', schedule: { cron: '@yearly' }, external: true, handler: () => {} });

    expect(listJobs(replica.manager)).toEqual([
      ['NAME', 'SCHEDULE', 'TIMEZONE', 'SCOPE', 'TARGET', 'NEXT RUNS'],
      [
        'billing.close-day',
        '0 3 * * *',
        'Europe/Warsaw',
        'cluster',
        'inline',
        '2026-01-02T02:00:00.000Z, 2026-01-03T02:00:00.000Z, 2026-01-04T02:00:00.000Z',
      ],
      [
        'cache.flush',
        'every 5m',
        '-',
        'instance',
        'inline',
        '2026-01-01T03:05:00.000Z, 2026-01-01T03:10:00.000Z, 2026-01-01T03:15:00.000Z',
      ],
      ['reports.build', 'every 1h', '-', 'cluster', 'queue:reports', expect.stringContaining('2026-01-01T04:00:00.000Z')],
      ['manual', '@yearly', 'UTC', 'cluster', 'inline', 'external only'],
    ]);
  });

  it('lays rows out as an aligned table', () => {
    expect(
      formatTable([
        ['NAME', 'SCOPE'],
        ['billing.close-day', 'cluster'],
      ]),
    ).toBe('NAME               SCOPE\nbilling.close-day  cluster');
  });

  it('runs a job for the occurrence its schedule is at, once across concurrent triggers', async () => {
    const other = await createReplica({ clock, instanceId: 'other-pod' }, store);
    let runs = 0;

    for (const { manager } of [replica, other]) {
      manager.add({ name: 'billing.close-day', schedule: { cron: '0 3 * * *' }, handler: () => void runs++ });
    }

    const [first, second] = await Promise.all([
      runJob(replica.manager, 'billing.close-day'),
      runJob(other.manager, 'billing.close-day'),
    ]);

    expect(runs).toBe(1);
    expect([first.result.outcome, second.result.outcome].sort()).toEqual(['completed', 'skipped-claimed']);
    expect(first.result.occurrenceId).toBe('billing.close-day@2026-01-01T03:00:00.000Z');
    expect([first.exitCode, second.exitCode]).toEqual([0, 0]);
    expect(replica.events[0].trigger).toBe('external');

    expect((await runJob(other.manager, 'billing.close-day', true)).result.outcome).toBe('completed');
    expect(runs).toBe(2);
  });

  it('exits with 1 when the job failed', async () => {
    replica.manager.add({
      name: 'broken',
      schedule: { every: '1h' },
      handler: () => {
        throw new Error('boom');
      },
    });

    expect(await runJob(replica.manager, 'broken')).toMatchObject({ exitCode: 1, result: { outcome: 'failed' } });
  });

  it('runs a job whose schedule has no occurrence yet under an occurrence of its own', async () => {
    replica.manager.add({ name: 'future', schedule: { cron: '0 0 1 1 *' }, handler: () => {} });
    vi.spyOn(replica.manager, 'currentOccurrence').mockReturnValue(null);

    expect((await runJob(replica.manager, 'future')).result.occurrenceId).toMatch(/^future@manual:/);
  });
});
