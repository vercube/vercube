import { createTestApp } from '@vercube/testing';
import { describe, expect, it } from 'vitest';
import { Every, SchedulerManager } from '../../src';
import { withManualClock } from '../../src/Testing';

class Reports {
  public generated: number = 0;

  @Every('1h', { name: 'reports.hourly' })
  public hourly(): void {
    this.generated++;
  }
}

describe('withManualClock', () => {
  it('should run jobs when the test moves the clock', async () => {
    const time = withManualClock('2026-01-01T00:00:00Z');
    await using app = await createTestApp({ providers: [Reports], extensions: [time] });

    expect(app.resolve(Reports).generated).toBe(0);

    await time.clock.advance('1h');
    expect(app.resolve(Reports).generated).toBe(1);

    await time.clock.advance('2h');
    expect(app.resolve(Reports).generated).toBe(3);
  });

  it('should trigger a job by name', async () => {
    const time = withManualClock();
    await using app = await createTestApp({ providers: [Reports], extensions: [time] });

    const result = await time.scheduler.trigger('reports.hourly');

    expect(result.outcome).toBe('completed');
    expect(app.resolve(Reports).generated).toBe(1);
    expect(time.scheduler).toBe(app.resolve(SchedulerManager));
  });
});
