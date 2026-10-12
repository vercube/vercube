import { describe, expect, it } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { formatDuration, parseDuration } from '../../src/Utils/Duration';

describe('parseDuration', () => {
  it.each([
    [250, 250],
    ['500ms', 500],
    ['30s', 30_000],
    ['5m', 300_000],
    ['1h', 3_600_000],
    ['1d', 86_400_000],
    ['1h30m', 5_400_000],
    ['1.5s', 1500],
    [' 2m ', 120_000],
  ])('reads %j', (value, expected) => {
    expect(parseDuration(value, 'test')).toBe(expected);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '', '5', '5 minutes', 'm5', '1w', '-5m'])('rejects %j', (value) => {
    expect(() => parseDuration(value, 'interval')).toThrow(SchedulerError);
    expect(() => parseDuration(value, 'interval')).toThrow(/"interval"/);
  });

  it('rejects values that are neither numbers nor strings', () => {
    expect(() => parseDuration({} as unknown as string, 'interval')).toThrow(SchedulerError);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0ms'],
    [500, '500ms'],
    [30_000, '30s'],
    [300_000, '5m'],
    [5_400_000, '1h30m'],
    [90_061_001, '1d1h1m1s1ms'],
    [0.4, '0ms'],
    [0.5, '1ms'],
    [1500.6, '1s501ms'],
  ])('writes %d as %s', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });
});
