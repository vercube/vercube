import { describe, expect, it, vi } from 'vitest';
import { QueueStrategy } from '../../src/Services/QueueStrategy';
import type { QueueTypes } from '../../src/Types/QueueTypes';

/** The smallest strategy the base class allows. */
class MinimalStrategy extends QueueStrategy {
  public readonly transport: string = 'minimal';

  public published: QueueTypes.PublishRequest[] = [];

  public initialize(): void {
    // nothing to connect to
  }

  public async publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef> {
    this.published.push(request);

    return { id: String(this.published.length), queue: request.queue, job: request.job, strategy: this.transport };
  }

  public async consume(request: QueueTypes.ConsumeRequest): Promise<QueueTypes.ConsumerHandle> {
    return { queue: request.queue, stop: async () => undefined };
  }

  public async close(): Promise<void> {
    // nothing to close
  }
}

/**
 * Builds a publish request.
 *
 * @param job - Name of the job
 * @returns A publish request
 */
function request(job: string): QueueTypes.PublishRequest {
  return { queue: 'emails', job, payload: {}, headers: {}, options: {} };
}

describe('QueueStrategy', () => {
  it('should claim no native features by default', () => {
    const strategy = new MinimalStrategy();

    expect(strategy.capabilities).toEqual({
      retries: false,
      delay: false,
      priority: false,
      progress: false,
      stats: false,
    });
  });

  it('should publish a batch one job at a time when the transport has no batch api', async () => {
    const strategy = new MinimalStrategy();
    const publish = vi.spyOn(strategy, 'publish');

    const refs = await strategy.publishMany([request('welcome'), request('digest')]);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(refs.map((ref) => ref.job)).toEqual(['welcome', 'digest']);
  });

  it('should publish nothing for an empty batch', async () => {
    const strategy = new MinimalStrategy();

    expect(await strategy.publishMany([])).toEqual([]);
    expect(strategy.published).toEqual([]);
  });

  it('should leave counters unimplemented', () => {
    expect(new MinimalStrategy().stats).toBeUndefined();
  });
});
