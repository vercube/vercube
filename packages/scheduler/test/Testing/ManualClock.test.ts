import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../src/Testing/ManualClock';

describe('ManualClock', () => {
  it('starts where it is told', () => {
    expect(new ManualClock('2026-01-01T00:00:00Z').now()).toBe(Date.UTC(2026, 0, 1));
  });

  it('fires due timers in order while advancing', async () => {
    const clock = new ManualClock(0);
    const fired: string[] = [];

    clock.setTimeout(() => fired.push('b'), 200);
    clock.setTimeout(() => fired.push('a'), 100);
    clock.setTimeout(() => fired.push('c'), 200);
    clock.setTimeout(() => fired.push('late'), 1000);

    await clock.advance(500);

    expect(fired).toEqual(['a', 'b', 'c']);
    expect(clock.now()).toBe(500);
    expect(clock.pending()).toEqual([new Date(1000)]);
  });

  it('sets the time to when each timer is due while it fires', async () => {
    const clock = new ManualClock(0);
    const seen: number[] = [];

    clock.setTimeout(() => seen.push(clock.now()), 100);
    await clock.advance('1s');

    expect(seen).toEqual([100]);
  });

  it('waits for the work a timer starts, including timers that work sets', async () => {
    const clock = new ManualClock(0);
    const steps: string[] = [];

    clock.setTimeout(async () => {
      steps.push('start');
      await clock.sleep(50);
      await Promise.resolve();
      steps.push('end');
    }, 100);

    await clock.advance(200);

    expect(steps).toEqual(['start', 'end']);
  });

  it('leaves work waiting beyond the target running', async () => {
    const clock = new ManualClock(0);
    const steps: string[] = [];

    clock.setTimeout(async () => {
      await clock.sleep(1000);
      steps.push('end');
    }, 100);

    await clock.advance(200);
    expect(steps).toEqual([]);

    await clock.advance(1000);
    expect(steps).toEqual(['end']);
  });

  it('cancels timers', async () => {
    const clock = new ManualClock(0);
    let fired = false;
    const handle = clock.setTimeout(() => (fired = true), 10);

    clock.clearTimeout(handle);
    await clock.advance(100);

    expect(fired).toBe(false);
  });

  it('jumps without firing, leaving overdue timers to the next advance', async () => {
    const clock = new ManualClock(0);
    const seen: number[] = [];

    clock.setTimeout(() => seen.push(clock.now()), 100);
    clock.set(5000);

    expect(seen).toEqual([]);

    await clock.advance();

    expect(seen).toEqual([5000]);
  });

  it('gives skewed views sharing its timers', async () => {
    const clock = new ManualClock(10_000);
    const behind = clock.skewed(-3000);
    const ahead = clock.skewed('2s');
    let fired = false;

    expect(behind.now()).toBe(7000);
    expect(ahead.now()).toBe(12_000);

    const handle = behind.setTimeout(() => (fired = true), 100);

    await clock.advance(100);
    expect(fired).toBe(true);

    behind.clearTimeout(handle);
  });
});
