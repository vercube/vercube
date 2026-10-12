import { describe, expect, it } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { assertTimezone, cronSchedule, everySchedule } from '../../src/Utils/Schedule';

const at = (iso: string): number => new Date(iso).getTime();
const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

describe('cronSchedule', () => {
  it('computes the next occurrence strictly after an instant', () => {
    const schedule = cronSchedule('*/5 * * * *', 'UTC', 'job');

    expect(iso(schedule.next(at('2026-01-01T00:00:00Z')))).toBe('2026-01-01T00:05:00.000Z');
    expect(iso(schedule.next(at('2026-01-01T00:04:59.999Z')))).toBe('2026-01-01T00:05:00.000Z');
  });

  it('computes the previous occurrence at or before an instant', () => {
    const schedule = cronSchedule('*/5 * * * *', 'UTC', 'job');

    expect(iso(schedule.previous(at('2026-01-01T00:05:00Z')))).toBe('2026-01-01T00:05:00.000Z');
    expect(iso(schedule.previous(at('2026-01-01T00:05:00.500Z')))).toBe('2026-01-01T00:05:00.000Z');
    expect(iso(schedule.previous(at('2026-01-01T00:04:59.999Z')))).toBe('2026-01-01T00:00:00.000Z');
  });

  it('accepts expressions with seconds and nicknames', () => {
    expect(iso(cronSchedule('*/10 * * * * *', 'UTC', 'job').next(at('2026-01-01T00:00:00Z')))).toBe('2026-01-01T00:00:10.000Z');
    expect(iso(cronSchedule('@daily', 'UTC', 'job').next(at('2026-01-01T00:00:00Z')))).toBe('2026-01-02T00:00:00.000Z');
  });

  it('reads the expression in its time zone', () => {
    const schedule = cronSchedule('0 3 * * *', 'Europe/Warsaw', 'job');

    expect(iso(schedule.next(at('2026-01-01T00:00:00Z')))).toBe('2026-01-01T02:00:00.000Z');
    expect(schedule).toMatchObject({ kind: 'cron', description: '0 3 * * *', timezone: 'Europe/Warsaw' });
  });

  it('reports a schedule that never fires again', () => {
    expect(cronSchedule('0 0 30 2 *', 'UTC', 'job').next(at('2026-01-01T00:00:00Z'))).toBeNull();
  });

  it('rejects an invalid expression, naming the job and the expression', () => {
    expect(() => cronSchedule('61 * * * *', 'UTC', 'billing.close-day')).toThrow(SchedulerError);
    expect(() => cronSchedule('61 * * * *', 'UTC', 'billing.close-day')).toThrow(/"61 \* \* \* \*".*"billing\.close-day"/);
  });

  it('rejects an unknown time zone', () => {
    expect(() => cronSchedule('* * * * *', 'Mars/Olympus', 'job')).toThrow(/Unknown time zone "Mars\/Olympus" for job "job"/);
    expect(() => assertTimezone('Mars/Olympus')).toThrow(SchedulerError);
    expect(() => assertTimezone('Europe/Warsaw')).not.toThrow();
  });

  describe('daylight saving time in Europe/Warsaw', () => {
    it('runs a time skipped by spring forward once, at the first valid instant', () => {
      const schedule = cronSchedule('30 2 * * *', 'Europe/Warsaw', 'job');

      // 02:30 does not exist on 2026-03-29, it runs at 03:30 CEST
      expect(iso(schedule.next(at('2026-03-28T12:00:00Z')))).toBe('2026-03-29T01:30:00.000Z');
      expect(iso(schedule.next(at('2026-03-29T01:30:00Z')))).toBe('2026-03-30T00:30:00.000Z');
    });

    it('runs a time repeated by fall back once, on its first pass', () => {
      const schedule = cronSchedule('30 2 * * *', 'Europe/Warsaw', 'job');

      expect(iso(schedule.next(at('2026-10-24T12:00:00Z')))).toBe('2026-10-25T00:30:00.000Z');
      expect(iso(schedule.next(at('2026-10-25T00:30:00Z')))).toBe('2026-10-26T01:30:00.000Z');
    });

    it('does not repeat the hour fall back repeats, leaving a 90 minute gap', () => {
      const schedule = cronSchedule('*/30 * * * *', 'Europe/Warsaw', 'job');

      expect(iso(schedule.next(at('2026-10-25T00:30:00Z')))).toBe('2026-10-25T02:00:00.000Z');
    });
  });
});

describe('everySchedule', () => {
  it('aligns occurrences to the Unix epoch', () => {
    const schedule = everySchedule(300_000, 0, 'job');

    expect(iso(schedule.next(at('2026-01-01T00:03:17Z')))).toBe('2026-01-01T00:05:00.000Z');
    expect(iso(schedule.next(at('2026-01-01T00:05:00Z')))).toBe('2026-01-01T00:10:00.000Z');
    expect(iso(schedule.previous(at('2026-01-01T00:05:00Z')))).toBe('2026-01-01T00:05:00.000Z');
    expect(iso(schedule.previous(at('2026-01-01T00:09:59Z')))).toBe('2026-01-01T00:05:00.000Z');
  });

  it('computes the same occurrences whenever it is asked', () => {
    const schedule = everySchedule(7000, 0, 'job');
    const first = schedule.next(at('2026-01-01T00:00:01Z'))!;
    const later = schedule.next(at('2026-01-01T00:00:03.250Z'))!;

    expect(first).toBe(later);
    expect(first % 7000).toBe(0);
  });

  it('shifts the grid by its offset', () => {
    const schedule = everySchedule(3_600_000, 900_000, 'job');

    expect(iso(schedule.next(at('2026-01-01T00:00:00Z')))).toBe('2026-01-01T00:15:00.000Z');
    expect(iso(schedule.next(at('2026-01-01T00:15:00Z')))).toBe('2026-01-01T01:15:00.000Z');
    expect(schedule.description).toBe('every 1h +15m');
  });

  it('rejects an interval shorter than a second', () => {
    expect(() => everySchedule(999, 0, 'job')).toThrow(/shortest one allowed is 1000ms/);
  });
});
