import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthRegistry } from '../../src';

describe('HealthRegistry', () => {
  let registry: HealthRegistry;

  beforeEach(() => {
    registry = new HealthRegistry();
    registry.configure({ cacheTtl: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should report ok without checks', async () => {
    const report = await registry.check();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({});
  });

  it('should not run anything on register', () => {
    const check = vi.fn();

    registry.register({ name: 'db', check });

    expect(check).not.toHaveBeenCalled();
    expect(registry.names).toEqual(['db']);
  });

  it('should treat a resolved check as healthy', async () => {
    registry.register({ name: 'db', check: async () => {} });

    const report = await registry.check();

    expect(report.status).toBe('ok');
    expect(report.checks.db).toMatchObject({ status: 'ok', critical: true });
    expect(report.checks.db.duration).toBeGreaterThanOrEqual(0);
  });

  it('should keep the details a check returns', async () => {
    registry.register({ name: 'db', check: () => ({ status: 'ok', details: { pool: 3 } }) });

    expect((await registry.check()).checks.db.details).toEqual({ pool: 3 });
  });

  it('should treat a thrown error as unhealthy', async () => {
    registry.register({
      name: 'db',
      check: () => {
        throw new Error('ECONNREFUSED');
      },
    });

    const report = await registry.check();

    expect(report.status).toBe('down');
    expect(report.checks.db).toMatchObject({ status: 'down', error: 'ECONNREFUSED' });
  });

  it('should treat a rejection as unhealthy', async () => {
    registry.register({ name: 'db', check: () => Promise.reject(new Error('gone')) });

    expect((await registry.check()).checks.db).toMatchObject({ status: 'down', error: 'gone' });
  });

  it("should treat { status: 'down' } as unhealthy", async () => {
    registry.register({ name: 'db', check: () => ({ status: 'down', details: { lag: 30 } }) });

    const report = await registry.check();

    expect(report.status).toBe('down');
    expect(report.checks.db).toMatchObject({ status: 'down', details: { lag: 30 } });
  });

  it('should only degrade on a non-critical failure', async () => {
    registry.register({ name: 'db', check: () => {} });
    registry.register({ name: 'cache', critical: false, check: () => Promise.reject(new Error('miss')) });

    const report = await registry.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.cache).toMatchObject({ status: 'down', critical: false });
  });

  it('should be down when a critical and a non-critical check fail', async () => {
    registry.register({ name: 'cache', critical: false, check: () => Promise.reject(new Error('miss')) });
    registry.register({ name: 'db', check: () => Promise.reject(new Error('gone')) });

    expect((await registry.check()).status).toBe('down');
  });

  it('should run checks in parallel', async () => {
    const started: string[] = [];
    const gate = Promise.withResolvers<void>();

    for (const name of ['a', 'b', 'c']) {
      registry.register({
        name,
        check: async () => {
          started.push(name);
          await gate.promise;
        },
      });
    }

    const report = registry.check();

    await vi.waitFor(() => expect(started).toEqual(['a', 'b', 'c']));
    gate.resolve();

    expect((await report).status).toBe('ok');
  });

  it('should fail a check that times out', async () => {
    registry.register({ name: 'slow', timeout: 20, check: () => new Promise(() => {}) });

    const report = await registry.check();

    expect(report.checks.slow).toMatchObject({ status: 'down', error: 'Timed out after 20ms' });
  });

  it('should use the configured default timeout', async () => {
    registry.configure({ timeout: 10 });
    registry.register({ name: 'slow', check: () => new Promise(() => {}) });

    expect((await registry.check()).checks.slow.error).toBe('Timed out after 10ms');
  });

  it('should reuse a report while it is fresh', async () => {
    registry.configure({ cacheTtl: 60_000 });

    const check = vi.fn();
    registry.register({ name: 'db', check });

    const first = await registry.check();
    const second = await registry.check();

    expect(check).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(registry.cached).toBe(first);
  });

  it('should run again once the report expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    registry.configure({ cacheTtl: 1000 });

    const check = vi.fn();
    registry.register({ name: 'db', check });

    await registry.check();
    vi.setSystemTime(Date.now() + 1001);
    await registry.check();

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('should share a run in progress', async () => {
    const gate = Promise.withResolvers<void>();
    const check = vi.fn(() => gate.promise);

    registry.register({ name: 'db', check });

    const first = registry.check();
    const second = registry.check();

    gate.resolve();

    expect(await first).toBe(await second);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('should cache a report from a check slower than the TTL', async () => {
    registry.configure({ cacheTtl: 50 });

    const check = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 80)));
    registry.register({ name: 'slow', check });

    await registry.check();
    await registry.check();

    expect(check).toHaveBeenCalledTimes(1);
  });

  it('should not let an older run replace the report of a fresh one', async () => {
    registry.configure({ cacheTtl: 60_000 });

    const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    let call = 0;

    registry.register({
      name: 'db',
      check: async () => {
        const index = call++;
        await gates[index].promise;
        return { status: 'ok', details: { call: index } };
      },
    });

    const older = registry.check();
    const fresh = registry.check({ fresh: true });

    gates[1].resolve();
    await fresh;
    gates[0].resolve();
    await older;

    expect(registry.cached?.checks.db.details).toEqual({ call: 1 });
    expect((await registry.check()).checks.db.details).toEqual({ call: 1 });
  });

  it('should not cache a run the checks changed under', async () => {
    registry.configure({ cacheTtl: 60_000 });

    const gate = Promise.withResolvers<void>();
    registry.register({ name: 'db', check: () => gate.promise });

    const stale = registry.check();
    registry.unregister('db');
    gate.resolve();
    await stale;

    expect(registry.cached).toBeNull();
    expect((await registry.check()).checks).toEqual({});
  });

  it('should run again with fresh', async () => {
    registry.configure({ cacheTtl: 60_000 });

    const check = vi.fn();
    registry.register({ name: 'db', check });

    await registry.check();
    await registry.check({ fresh: true });

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('should drop the cached report when the checks change', async () => {
    registry.configure({ cacheTtl: 60_000 });
    registry.register({ name: 'db', check: () => {} });

    await registry.check();
    registry.register({ name: 'cache', check: () => Promise.reject(new Error('miss')) });

    const report = await registry.check();

    expect(Object.keys(report.checks)).toEqual(['db', 'cache']);
    expect(report.status).toBe('down');
  });

  it('should replace a check registered under the same name', async () => {
    registry.register({ name: 'db', check: () => Promise.reject(new Error('old')) });
    registry.register({ name: 'db', check: () => {} });

    expect(registry.size).toBe(1);
    expect((await registry.check()).status).toBe('ok');
  });

  it('should only remove its own registration', () => {
    const removeOld = registry.register({ name: 'db', check: () => {} });
    registry.register({ name: 'db', check: () => {} });

    removeOld();

    expect(registry.has('db')).toBe(true);
    expect(registry.unregister('db')).toBe(true);
    expect(registry.has('db')).toBe(false);
  });

  it('should refuse a check without a name or function', () => {
    expect(() => registry.register({ name: ' ', check: () => {} })).toThrow('needs a name');
    expect(() => registry.register({ name: 'db' } as never)).toThrow('needs a check function');
    expect(() => registry.register({ name: 'db', timeout: -1, check: () => {} })).toThrow('at least 0');
  });

  it('should refuse invalid settings', () => {
    expect(() => registry.configure({ timeout: Number.NaN })).toThrow('health.timeout');
    expect(() => registry.configure({ cacheTtl: -5 })).toThrow('health.cacheTtl');
  });
});
