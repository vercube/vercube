import { getErrorGuidance } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { PostgresStore } from '../../src/Stores/PostgresStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { withManualClock } from '../../src/Testing/WithManualClock';
import { parseDuration } from '../../src/Utils/Duration';
import { asError } from '../../src/Utils/Errors';
import { createReplica } from '../Utils/Harness';

/**
 * Runs a function and returns what it threw.
 *
 * @param run - The function expected to throw
 * @returns The thrown value
 */
async function thrownBy(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the call to throw');
}

describe('SchedulerErrors', () => {
  it('describes a job registered twice', async () => {
    const { manager } = await createReplica({ clock: new ManualClock('2026-01-01T00:00:00Z') });

    manager.add({ name: 'job', schedule: { every: '1m' }, scope: 'instance', handler: () => {}, source: 'A.job' });

    const error = (await thrownBy(() =>
      manager.add({ name: 'job', schedule: { every: '1m' }, handler: () => {}, source: 'B.job' }),
    )) as SchedulerError;

    expect(error).toBeInstanceOf(SchedulerError);
    expect(error.name).toBe('SchedulerError');
    expect(error.message).toBe('Job "job" is already registered');
    expect(error.operation).toBe('register');
    expect(error.retryable).toBe(false);
    expect(error.cause).toBeUndefined();
    expect(error.metadata).toEqual({ registered: 'A.job', duplicate: 'B.job' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_SCHEDULER_JOB_DUPLICATE');
    expect(getErrorGuidance(error)?.fix).toContain('@Cron()');
  });

  it('keeps the parser error of an invalid cron expression as the cause', async () => {
    const { manager } = await createReplica({ clock: new ManualClock('2026-01-01T00:00:00Z') });
    const error = (await thrownBy(() =>
      manager.add({ name: 'bad-cron', schedule: { cron: 'nope' }, handler: () => {} }),
    )) as SchedulerError;

    expect(error).toBeInstanceOf(SchedulerError);
    expect(error.message).toMatch(/^Invalid cron expression "nope" for job "bad-cron": /);
    expect(error.message).toBe(`Invalid cron expression "nope" for job "bad-cron": ${error.cause?.message}`);
    expect(error.operation).toBe('register');
    expect(error.retryable).toBe(false);
    expect(error.cause).toBeInstanceOf(Error);
    expect(Object.keys(error)).toContain('cause');
    expect(error.metadata).toEqual({ job: 'bad-cron', expression: 'nope' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_SCHEDULER_CRON_INVALID');
  });

  it('describes an unknown job and an option that cannot be read', async () => {
    const { manager } = await createReplica({ clock: new ManualClock('2026-01-01T00:00:00Z') });
    const unknown = (await thrownBy(() => manager.pause('missing'))) as SchedulerError;

    expect(unknown).toBeInstanceOf(SchedulerError);
    expect(unknown.message).toBe('No job is registered as "missing"');
    expect(unknown.metadata).toEqual({ registered: [] });
    expect(getErrorGuidance(unknown)?.code).toBe('VERCUBE_SCHEDULER_JOB_UNKNOWN');

    const duration = (await thrownBy(() => parseDuration('soon' as never, 'job.timeout'))) as SchedulerError;

    expect(duration).toBeInstanceOf(SchedulerError);
    expect(duration.message).toBe(
      `Invalid duration "soon" for "job.timeout", use milliseconds or a string such as '30s', '5m', '1h' or '1d'`,
    );
    expect(duration.operation).toBe('configure');
    expect(duration.retryable).toBe(false);
    expect(duration.metadata).toEqual({ option: 'job.timeout' });
    expect(getErrorGuidance(duration)?.code).toBe('VERCUBE_SCHEDULER_DURATION_INVALID');

    const retries = (await thrownBy(() =>
      manager.add({ name: 'bad-retries', schedule: { every: '1m' }, retries: -1, handler: () => {} }),
    )) as SchedulerError;

    expect(retries.message).toBe('retries of "bad-retries" must be a whole number of 0 or more');
    expect(retries.metadata).toEqual({});
    expect(getErrorGuidance(retries)?.code).toBe('VERCUBE_SCHEDULER_RETRIES_INVALID');
  });

  it('keeps the plain errors plain', async () => {
    const extension = (await thrownBy(() => withManualClock().scheduler)) as Error;

    expect(extension.constructor).toBe(Error);
    expect(extension.message).toBe('withManualClock() is not set up yet: pass it to createTestApp({ extensions }) first.');
    expect(getErrorGuidance(extension)?.code).toBe('VERCUBE_SCHEDULER_TESTING_NOT_SET_UP');

    const ping = (await thrownBy(() => new PostgresStore().ping())) as Error;

    expect(ping.constructor).toBe(Error);
    expect(ping.message).toBe('The Postgres store is not initialized');
    expect(getErrorGuidance(ping)?.code).toBe('VERCUBE_SCHEDULER_POSTGRES_STORE_PING_NOT_INITIALIZED');

    // a value a handler threw is wrapped, not described
    expect(getErrorGuidance(asError('boom'))).toBeUndefined();
  });
});
