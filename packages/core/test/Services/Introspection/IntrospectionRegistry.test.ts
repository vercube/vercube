import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntrospectionRegistry } from '../../../src/Services/Introspection/IntrospectionRegistry';
import type { IntrospectionTypes } from '../../../src/Types/IntrospectionTypes';

/**
 * A provider whose revision and payload can be driven from a test.
 *
 * @param id - Section id
 * @returns The provider plus a call counter and a way to change its data
 */
function createProvider(id: string): {
  provider: IntrospectionTypes.Provider<string>;
  calls: () => number;
  change: (value: string) => void;
} {
  let revision = 1;
  let value = 'initial';
  let calls = 0;

  return {
    calls: () => calls,
    change: (next: string) => {
      value = next;
      revision++;
    },
    provider: {
      id,
      title: id,
      revision: () => revision,
      describe: () => {
        calls++;
        return value;
      },
    },
  };
}

describe('IntrospectionRegistry', () => {
  let registry: IntrospectionRegistry;

  beforeEach(() => {
    registry = new IntrospectionRegistry();
  });

  it('describes a registered section', async () => {
    registry.register(createProvider('routes').provider);

    await expect(registry.describe('routes')).resolves.toMatchObject({ id: 'routes', revision: 1, data: 'initial' });
  });

  it('returns undefined for an unknown section', async () => {
    await expect(registry.describe('nope')).resolves.toBeUndefined();
  });

  it('caches while the revision holds', async () => {
    const { provider, calls } = createProvider('routes');
    registry.register(provider);

    await registry.describe('routes');
    await registry.describe('routes');
    await registry.describe('routes');

    // This is the whole point of the cache: an overview panel that shows routes
    // three times must not rebuild them three times.
    expect(calls()).toBe(1);
  });

  it('rebuilds once the revision changes', async () => {
    const { provider, calls, change } = createProvider('routes');
    registry.register(provider);

    await registry.describe('routes');
    change('updated');

    await expect(registry.describe('routes')).resolves.toMatchObject({ revision: 2, data: 'updated' });
    expect(calls()).toBe(2);
  });

  it('lists sections without describing them', () => {
    const { provider, calls } = createProvider('routes');
    registry.register(provider);
    registry.register(createProvider('config').provider);

    expect(registry.list()).toEqual([
      { id: 'config', title: 'config', revision: 1 },
      { id: 'routes', title: 'routes', revision: 1 },
    ]);
    expect(calls()).toBe(0);
  });

  it('describes everything at once', async () => {
    registry.register(createProvider('routes').provider);
    registry.register(createProvider('config').provider);

    const all = await registry.describeAll();

    expect(Object.keys(all).sort()).toEqual(['config', 'routes']);
  });

  it('notifies subscribers on touch', () => {
    const { provider, change } = createProvider('routes');
    const listener = vi.fn();

    registry.register(provider);
    registry.onInvalidate(listener);
    change('updated');
    registry.touch('routes');

    expect(listener).toHaveBeenCalledWith('routes', 2);
  });

  it('survives a throwing subscriber', () => {
    const listener = vi.fn();

    registry.register(createProvider('routes').provider);
    registry.onInvalidate(() => {
      throw new Error('broken consumer');
    });
    registry.onInvalidate(listener);

    expect(() => registry.touch('routes')).not.toThrow();
    expect(listener).toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();

    registry.register(createProvider('routes').provider);
    registry.onInvalidate(listener)();
    registry.touch('routes');

    expect(listener).not.toHaveBeenCalled();
  });

  it('unregisters a provider', async () => {
    const remove = registry.register(createProvider('routes').provider);

    remove();

    expect(registry.has('routes')).toBe(false);
    await expect(registry.describe('routes')).resolves.toBeUndefined();
  });

  it('replaces a provider registered under the same id', async () => {
    registry.register(createProvider('routes').provider);
    registry.register({ id: 'routes', title: 'Other', revision: () => 1, describe: () => 'other' });

    await expect(registry.describe('routes')).resolves.toMatchObject({ title: 'Other', data: 'other' });
  });
});
