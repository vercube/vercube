import { parseDuration } from '../Utils/Duration';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/** A timer waiting on a {@link ManualClock}. */
interface ManualTimer {
  /** Id handed out as the timer handle. */
  id: number;

  /** When the timer is due, epoch milliseconds. */
  at: number;

  /** What to call. */
  fn: () => unknown;
}

/**
 * Lets the event loop run once, through a real macrotask, so every promise chain
 * that only waits on other promises gets to finish.
 *
 * @returns Resolves on the next turn of the event loop
 */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setImmediate === 'function') {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Clock whose time only moves when a test moves it.
 *
 * Hand it to the scheduler with the `clock` option and the timers of every job
 * fire exactly when the test says so, without waiting real time. Advancing the
 * clock also waits for the runs the fired timers started, so after
 * `await clock.advance('5m')` every run due in those five minutes is done.
 *
 * It depends on nothing from the framework, so it works with any test runner.
 *
 * @example
 * ```ts
 * import { ManualClock } from '@vercube/scheduler/testing';
 *
 * const clock = new ManualClock('2026-01-01T00:00:00Z');
 *
 * app.addPlugin(SchedulerPlugin, { clock, store: { store: MemoryStore } });
 *
 * await clock.advance('1h');
 * expect(reports.generated).toBe(1);
 * ```
 */
export class ManualClock implements SchedulerTypes.Clock {
  /** Current time, epoch milliseconds */
  private fNow: number;

  /** Pending timers, in no particular order */
  private fTimers: ManualTimer[] = [];

  /** Work started by fired timers that has not settled yet */
  private fBusy: Set<Promise<unknown>> = new Set();

  /** Id of the last timer created, also counting how many were */
  private fSequence: number = 0;

  /**
   * @param start - Time the clock starts at, defaults to the current time
   */
  constructor(start: Date | number | string = Date.now()) {
    this.fNow = new Date(start).getTime();
  }

  /** @inheritdoc */
  public now(): number {
    return this.fNow;
  }

  /** @inheritdoc */
  public setTimeout(fn: () => unknown, ms: number): unknown {
    const id = ++this.fSequence;

    this.fTimers.push({ id, at: this.fNow + Math.max(0, ms), fn });

    return id;
  }

  /** @inheritdoc */
  public clearTimeout(handle: unknown): void {
    this.fTimers = this.fTimers.filter((timer) => timer.id !== handle);
  }

  /**
   * Moves the clock to an instant without firing anything, the way a laptop
   * waking up finds its timers overdue. A following `advance()` fires them, late.
   *
   * @param date - New current time
   * @returns Nothing
   */
  public set(date: Date | number | string): void {
    this.fNow = new Date(date).getTime();
  }

  /**
   * Moves time forward, firing every timer that falls due on the way, in order,
   * and waiting for the work each one starts before moving on.
   *
   * Work still waiting on a timer beyond the target is left running, it
   * continues on a later advance. Calls must not overlap.
   *
   * @param duration - How far to move, in milliseconds or as a string such as `'5m'`
   * @returns Resolves once every fired timer's work has settled
   */
  public async advance(duration: SchedulerTypes.Duration = 0): Promise<void> {
    const target = this.fNow + parseDuration(duration, 'advance');

    await this.settle();

    for (let timer = this.due(target); timer; timer = this.due(target)) {
      this.fTimers = this.fTimers.filter((entry) => entry !== timer);
      this.fNow = Math.max(this.fNow, timer.at);

      const result = timer.fn();

      if (result instanceof Promise) {
        const tracked = result.catch(() => undefined).finally(() => this.fBusy.delete(tracked));

        this.fBusy.add(tracked);
      }

      await this.settle();
    }

    this.fNow = Math.max(this.fNow, target);

    await this.settle();
  }

  /**
   * Waits on this clock, for handlers simulating long work in tests.
   *
   * @param duration - How long to wait
   * @returns Resolves once the clock has been advanced that far
   */
  public sleep(duration: SchedulerTypes.Duration): Promise<void> {
    return new Promise((resolve) => {
      this.setTimeout(resolve, parseDuration(duration, 'sleep'));
    });
  }

  /**
   * When the pending timers are due, earliest first.
   *
   * @returns The due instants
   */
  public pending(): Date[] {
    return this.fTimers
      .map((timer) => timer.at)
      .sort((a, b) => a - b)
      .map((at) => new Date(at));
  }

  /**
   * A view of this clock that is off by a fixed amount, to simulate a replica
   * whose system time is skewed. It shares the timers of this clock, so
   * advancing this clock drives both.
   *
   * @param offset - How far ahead the view is, negative (such as `'-3s'`) when it is behind
   * @returns The skewed clock
   */
  public skewed(offset: SchedulerTypes.Duration): SchedulerTypes.Clock {
    const text = String(offset).trim();
    const negative = typeof offset === 'string' && text.startsWith('-');
    const magnitude = typeof offset === 'number' ? offset : parseDuration(negative ? text.slice(1) : text, 'skewed');
    const shift = negative ? -magnitude : magnitude;

    return {
      now: () => this.fNow + shift,
      setTimeout: (fn, ms) => this.setTimeout(fn, ms),
      clearTimeout: (handle) => this.clearTimeout(handle),
    };
  }

  /**
   * Earliest timer due at or before an instant, the oldest first on a tie.
   *
   * @param target - Instant to look up to
   * @returns The timer, or undefined when none is due
   */
  private due(target: number): ManualTimer | undefined {
    let earliest: ManualTimer | undefined;

    for (const timer of this.fTimers) {
      if (timer.at <= target && (!earliest || timer.at < earliest.at || (timer.at === earliest.at && timer.id < earliest.id))) {
        earliest = timer;
      }
    }

    return earliest;
  }

  /**
   * Runs the event loop until the work started by fired timers has either
   * finished or stopped making progress, which means it waits on this clock.
   *
   * @returns Resolves once nothing moves any more
   */
  private async settle(): Promise<void> {
    let previous = '';

    for (let turn = 0; turn < 1000; turn++) {
      await nextTurn();

      const state = `${this.fBusy.size}:${this.fTimers.length}:${this.fSequence}`;

      if (this.fBusy.size === 0 || state === previous) {
        return;
      }

      previous = state;
    }
  }
}
