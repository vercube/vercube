import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryRegistry } from '../../../src/Services/Telemetry/TelemetryRegistry';
import type { TelemetryTypes } from '../../../src/Types/TelemetryTypes';

/**
 * A hooks implementation that records nothing.
 *
 * @returns The stub
 */
function stub(): TelemetryTypes.Hooks {
  return {
    server: (_context, fn) => fn(),
    recordError: () => undefined,
    traceId: () => undefined,
    flush: () => Promise.resolve(),
  };
}

describe('TelemetryRegistry', () => {
  let registry: TelemetryRegistry;

  beforeEach(() => {
    registry = new TelemetryRegistry();
  });

  it('starts empty', () => {
    expect(registry.hooks).toBeNull();
    expect(registry.enabled).toBe(false);
    expect(registry.options).toBeNull();
  });

  it('exposes what was installed', () => {
    const hooks = stub();
    registry.install(hooks, { enabled: true, metrics: false });

    expect(registry.hooks).toBe(hooks);
    expect(registry.enabled).toBe(true);
    expect(registry.options).toEqual({ enabled: true, metrics: false });
  });

  it('defaults the options when none are given', () => {
    registry.install(stub());

    expect(registry.options).toEqual({});
  });

  it('refuses a second implementation', () => {
    registry.install(stub());

    expect(() => registry.install(stub())).toThrow(/already installed/);
  });

  it('can be emptied again', () => {
    registry.install(stub());
    registry.uninstall();

    expect(registry.enabled).toBe(false);
    expect(registry.options).toBeNull();
    expect(() => registry.install(stub())).not.toThrow();
  });
});
