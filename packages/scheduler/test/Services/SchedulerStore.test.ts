import { describe, expect, it } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { SchedulerStore } from '../../src/Services/SchedulerStore';
import { ManualClock } from '../../src/Testing/ManualClock';

class MinimalStore extends SchedulerStore {
  public readonly name: string = 'minimal';
  public initialize(): void {}
  public async claim(): Promise<boolean> {
    return true;
  }
  public async extend(): Promise<boolean> {
    return true;
  }
  public async release(): Promise<boolean> {
    return true;
  }
  public async getState(): Promise<null> {
    return null;
  }
  public async setState(): Promise<void> {}
  public async close(): Promise<void> {}
}

describe('SchedulerStore', () => {
  it('is not distributed and ignores the manager clock unless it says otherwise', () => {
    const store = new MinimalStore();

    expect(store.capabilities).toEqual({ distributed: false });
    expect(() => store.useClock(new ManualClock(0))).not.toThrow();
  });
});

describe('SchedulerError', () => {
  it('carries the operation, cause, metadata and retryable flag', () => {
    const cause = new Error('cause');
    const error = new SchedulerError('failed', 'claim', cause, { job: 'a' }, false);

    expect(error).toMatchObject({ name: 'SchedulerError', operation: 'claim', cause, metadata: { job: 'a' }, retryable: false });
    expect(new SchedulerError('failed', 'claim').retryable).toBe(true);
  });
});
