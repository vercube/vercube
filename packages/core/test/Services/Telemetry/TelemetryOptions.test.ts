import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTelemetryContributions,
  contributeTelemetryOptions,
  isTelemetryEnabled,
  resolveTelemetryOptions,
} from '../../../src/Services/Telemetry/TelemetryOptions';

describe('resolveTelemetryOptions', () => {
  afterEach(() => clearTelemetryContributions());

  it('defaults to on outside production and off inside it', () => {
    expect(resolveTelemetryOptions({}).enabled).toBe(true);
    expect(resolveTelemetryOptions({ production: true }).enabled).toBe(false);
  });

  it('accepts the boolean shorthand either way', () => {
    expect(resolveTelemetryOptions({ telemetry: true, production: true }).enabled).toBe(true);
    expect(resolveTelemetryOptions({ telemetry: false }).enabled).toBe(false);
  });

  it('lets an explicit enabled beat the production default', () => {
    expect(resolveTelemetryOptions({ telemetry: { enabled: true }, production: true }).enabled).toBe(true);
  });

  it('keeps the rest of the options', () => {
    expect(resolveTelemetryOptions({ telemetry: { sampler: { ratio: 0.1 }, metrics: false } })).toMatchObject({
      enabled: true,
      sampler: { ratio: 0.1 },
      metrics: false,
    });
  });

  it('merges a contribution into the boolean shorthand', () => {
    // The case a `configure()` patch cannot reach: defu will not merge an
    // object into `telemetry: true`.
    contributeTelemetryOptions({ exclude: ['/_devtools'] });

    expect(resolveTelemetryOptions({ telemetry: true }).exclude).toEqual(['/_devtools']);
  });

  it('concatenates exclusions rather than replacing them', () => {
    contributeTelemetryOptions({ exclude: ['/_devtools'] });

    expect(resolveTelemetryOptions({ telemetry: { exclude: ['/health'] } }).exclude).toEqual(
      expect.arrayContaining(['/health', '/_devtools']),
    );
  });

  it('lets the application win a conflict with a contribution', () => {
    contributeTelemetryOptions({ spans: { middleware: false } });

    expect(resolveTelemetryOptions({ telemetry: { spans: { middleware: true } } }).spans?.middleware).toBe(true);
  });

  it('merges several contributions', () => {
    contributeTelemetryOptions({ exclude: ['/a'] });
    contributeTelemetryOptions({ exclude: ['/b'] });

    expect(resolveTelemetryOptions({}).exclude).toEqual(expect.arrayContaining(['/a', '/b']));
  });

  it('withdraws a contribution', () => {
    const withdraw = contributeTelemetryOptions({ exclude: ['/gone'] });
    withdraw();

    expect(resolveTelemetryOptions({}).exclude).toBeUndefined();
  });
});

describe('isTelemetryEnabled', () => {
  it('mirrors the resolved flag', () => {
    expect(isTelemetryEnabled({ telemetry: false })).toBe(false);
    expect(isTelemetryEnabled({ production: false })).toBe(true);
  });
});
