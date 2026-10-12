import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it } from 'vitest';
import { matchesSecret, SchedulerController } from '../../src/Controllers/SchedulerController';
import { SchedulerManager } from '../../src/Services/SchedulerManager';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { $SchedulerHttpOptions } from '../../src/Symbols/SchedulerSymbols';
import { ManualClock } from '../../src/Testing/ManualClock';
import { createLogger } from '../Utils/Harness';

describe('SchedulerController', () => {
  let controller: SchedulerController;
  let manager: SchedulerManager;
  let runs: number;

  beforeEach(async () => {
    const container = new Container();

    container.bindInstance(Container, container);
    container.bindInstance(Logger, createLogger());
    container.bindInstance($SchedulerHttpOptions, { secret: 's3cret', path: '/_scheduler' });
    container.bind(SchedulerManager);
    container.bind(SchedulerController);

    manager = container.get(SchedulerManager);
    manager.configure({ autoStart: false, clock: new ManualClock('2026-01-01T03:00:05Z') });
    await manager.mount({ store: MemoryStore });

    runs = 0;
    manager.add({ name: 'billing.close-day', schedule: { cron: '0 3 * * *' }, handler: () => void runs++ });
    manager.add({
      name: 'broken',
      schedule: { cron: '0 3 * * *' },
      handler: () => {
        throw new Error('boom');
      },
    });

    controller = container.get(SchedulerController);
  });

  it('refuses a request without the secret', async () => {
    for (const header of [undefined, '', 's3cret', 'Bearer wrong', 'Basic s3cret', 'Bearer ']) {
      const response = await controller.get('billing.close-day', header);

      expect(response.status).toBe(401);
    }

    expect(runs).toBe(0);
  });

  it('runs the job for its current occurrence, once', async () => {
    const response = await controller.get('billing.close-day', 'Bearer s3cret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      outcome: 'completed',
      occurrenceId: 'billing.close-day@2026-01-01T03:00:00.000Z',
      durationMs: 0,
    });

    const again = await controller.post('billing.close-day', 'bearer s3cret');

    expect(await again.json()).toMatchObject({ outcome: 'skipped-claimed' });
    expect(runs).toBe(1);
  });

  it('answers 404 for an unknown job and 500 for a failed one', async () => {
    expect((await controller.get('ghost', 'Bearer s3cret')).status).toBe(404);

    const failed = await controller.post('broken', 'Bearer s3cret');

    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ outcome: 'failed', error: 'boom' });
  });

  it('compares secrets without short-circuiting on length', async () => {
    expect(await matchesSecret('Bearer abc', 'abc')).toBe(true);
    expect(await matchesSecret('Bearer abcd', 'abc')).toBe(false);
    expect(await matchesSecret('Bearer ab', 'abc')).toBe(false);
  });
});
