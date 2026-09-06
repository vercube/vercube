import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStrategy } from '../../src/Strategies/MemoryStrategy';
import { ATTEMPT_HEADER, JOB_HEADER } from '../../src/Utils/Job';
import type { QueueTypes } from '../../src/Types/QueueTypes';

/**
 * Builds a publish request the way the manager does.
 *
 * @param overrides - Fields to override
 * @returns A publish request
 */
function request(overrides: Partial<QueueTypes.PublishRequest> = {}): QueueTypes.PublishRequest {
  return {
    queue: 'emails',
    job: 'welcome',
    payload: { id: 1 },
    headers: { [JOB_HEADER]: 'welcome', [ATTEMPT_HEADER]: '1' },
    options: {},
    ...overrides,
  };
}

describe('MemoryStrategy', () => {
  let strategy: MemoryStrategy;

  beforeEach(() => {
    strategy = new MemoryStrategy();
    strategy.initialize();
  });

  it('should report what it supports', () => {
    expect(strategy.transport).toBe('memory');
    expect(strategy.capabilities).toEqual({
      retries: false,
      delay: true,
      priority: true,
      progress: true,
      stats: true,
      peek: true,
    });
  });

  it('should hand published jobs to the consumer', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    const ref = await strategy.publish(request());
    await strategy.idle();

    expect(ref).toEqual({ id: expect.any(String), queue: 'emails', job: 'welcome', strategy: 'memory' });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ job: 'welcome', payload: { id: 1 }, attempt: 1 });
  });

  it('should keep jobs published before a consumer started', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await strategy.publish(request());
    expect(await strategy.stats('emails')).toMatchObject({ waiting: 1 });

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.idle();

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('should read the attempt from the headers', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.publish(request({ headers: { [JOB_HEADER]: 'welcome', [ATTEMPT_HEADER]: '3' } }));
    await strategy.idle();

    expect(dispatch.mock.calls[0][0].attempt).toBe(3);
  });

  it('should use an explicit job id when one is given', async () => {
    const ref = await strategy.publish(request({ options: { jobId: 'fixed-id' } }));

    expect(ref.id).toBe('fixed-id');
  });

  it('should run one job at a time by default', async () => {
    let running = 0;
    let peak = 0;

    const dispatch = vi.fn().mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.publish(request());
    await strategy.publish(request());
    await strategy.publish(request());
    await strategy.idle();

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(peak).toBe(1);
  });

  it('should run jobs in parallel up to the concurrency', async () => {
    let running = 0;
    let peak = 0;

    const dispatch = vi.fn().mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });

    await strategy.consume({ queue: 'emails', concurrency: 3, dispatch });
    await strategy.publish(request());
    await strategy.publish(request());
    await strategy.publish(request());
    await strategy.idle();

    expect(peak).toBe(3);
  });

  it('should process lower priorities first, publish order otherwise', async () => {
    const seen: unknown[] = [];
    const dispatch = vi.fn().mockImplementation(async (job: QueueTypes.IncomingJob) => {
      seen.push((job.payload as { id: number }).id);
    });

    await strategy.publish(request({ payload: { id: 1 }, options: { priority: 5 } }));
    await strategy.publish(request({ payload: { id: 2 }, options: { priority: 1 } }));
    await strategy.publish(request({ payload: { id: 3 }, options: { priority: 1 } }));

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.idle();

    expect(seen).toEqual([2, 3, 1]);
  });

  it('should hold a delayed job until its delay elapsed', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.publish(request({ options: { delay: 20 } }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(await strategy.stats('emails')).toMatchObject({ delayed: 1, waiting: 0 });

    await strategy.idle();

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('should report progress back to the job', async () => {
    const dispatch = vi.fn().mockImplementation(async (job: QueueTypes.IncomingJob) => {
      await job.updateProgress?.(50);
    });

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.publish(request());
    await strategy.idle();

    expect((dispatch.mock.calls[0][0].raw as { progress?: number }).progress).toBe(50);
  });

  it('should count a failed job without requeuing it', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('boom'));

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.publish(request());
    await strategy.idle();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await strategy.stats('emails')).toMatchObject({ failed: 1, waiting: 0, active: 0 });
  });

  it('should count completed jobs', async () => {
    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });
    await strategy.publish(request());
    await strategy.publish(request());
    await strategy.idle();

    expect(await strategy.stats('emails')).toMatchObject({ completed: 2 });
  });

  it('should report zeroed counters for an unknown queue', async () => {
    expect(await strategy.stats('nothing')).toEqual({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
  });

  it('should wait for in-flight jobs when a consumer stops', async () => {
    let settled = false;
    const dispatch = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      settled = true;
    });

    const handle = await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.publish(request());
    await handle.stop();

    expect(settled).toBe(true);
  });

  it('should leave waiting jobs alone after the consumer stopped', async () => {
    const handle = await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

    await handle.stop();
    await strategy.publish(request());

    expect(await strategy.stats('emails')).toMatchObject({ waiting: 1 });
  });

  it('should drop everything on close', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
    await strategy.publish(request({ options: { delay: 5000 } }));
    await strategy.close();

    expect(await strategy.stats('emails')).toMatchObject({ waiting: 0, delayed: 0 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  describe('stopping', () => {
    it('should leave the backlog alone and only await what is in flight', async () => {
      let release: (() => void) | undefined;
      const started: string[] = [];

      const handle = await strategy.consume({
        queue: 'emails',
        concurrency: 1,
        dispatch: async (job) => {
          started.push(job.id);

          if (started.length === 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
        },
      });

      await strategy.publish(request({ options: { jobId: 'a' } }));
      await strategy.publish(request({ options: { jobId: 'b' } }));
      await strategy.publish(request({ options: { jobId: 'c' } }));

      const stopping = handle.stop();

      release?.();
      await stopping;

      // Every finishing job pumps the queue again, so stopping while still
      // attached would work through the whole backlog instead.
      expect(started).toEqual(['a']);
      await expect(strategy.stats('emails')).resolves.toMatchObject({ waiting: 2, active: 0 });
    });
  });

  describe('peeking', () => {
    it('should show what is waiting, in the order it would run', async () => {
      await strategy.publish(request({ payload: { id: 1 }, options: { priority: 5 } }));
      await strategy.publish(request({ payload: { id: 2 }, options: { priority: 1 } }));

      const messages = await strategy.peek({ queue: 'emails', limit: 20, states: ['waiting', 'delayed', 'failed'] });

      expect(messages.map((message) => (message.payload as { id: number }).id)).toEqual([2, 1]);
      expect(messages[0]).toMatchObject({ job: 'welcome', state: 'waiting', attempt: 1 });
    });

    it('should show a delayed job with the time it becomes available', async () => {
      await strategy.publish(request({ options: { delay: 5000 } }));

      const [message] = await strategy.peek({ queue: 'emails', limit: 20, states: ['waiting', 'delayed'] });

      expect(message).toMatchObject({ state: 'delayed' });
      expect(message.availableAt).toBeGreaterThan(Date.now());
    });

    it('should honour the states it is asked for', async () => {
      await strategy.publish(request());
      await strategy.publish(request({ options: { delay: 5000 } }));

      expect(await strategy.peek({ queue: 'emails', limit: 20, states: ['delayed'] })).toHaveLength(1);
      expect(await strategy.peek({ queue: 'emails', limit: 20, states: ['waiting'] })).toHaveLength(1);
      expect(await strategy.peek({ queue: 'emails', limit: 20, states: ['failed'] })).toEqual([]);
    });

    it('should honour the limit', async () => {
      await strategy.publish(request());
      await strategy.publish(request());
      await strategy.publish(request());

      expect(await strategy.peek({ queue: 'emails', limit: 2, states: ['waiting'] })).toHaveLength(2);
    });

    it('should report nothing for a queue it never saw', async () => {
      expect(await strategy.peek({ queue: 'nothing', limit: 20, states: ['waiting'] })).toEqual([]);
    });
  });

  it('should resolve idle when nothing is pending', async () => {
    await expect(strategy.idle()).resolves.toBeUndefined();
  });
});
