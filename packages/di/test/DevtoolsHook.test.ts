import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from '../src/Domain/Container';
import { addIOCDevtoolsHook, getIOCDevtoolsHook, setIOCDevtoolsHook } from '../src/Domain/DevtoolsHook';

class Service {}

describe('IOC observer registry', () => {
  afterEach(() => setIOCDevtoolsHook(undefined));

  it('is absent until something observes', () => {
    expect(getIOCDevtoolsHook()).toBeUndefined();
  });

  it('notifies every observer, not just the last one', () => {
    // The single slot this replaced meant whoever installed second silently
    // evicted the first, which telemetry and devtools would both have hit.
    const first = vi.fn();
    const second = vi.fn();

    addIOCDevtoolsHook({ onResolved: first });
    addIOCDevtoolsHook({ onResolved: second });

    const container = new Container();
    container.bind(Service);
    container.get(Service);

    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('reports construction timing for the resolved key', () => {
    const observed: { name: string; start: number; end: number }[] = [];
    addIOCDevtoolsHook({ onResolved: (record) => observed.push(record) });

    const container = new Container();
    container.bind(Service);
    container.get(Service);

    const record = observed.find((entry) => entry.name === 'Service')!;

    expect(record).toBeDefined();
    expect(record.end).toBeGreaterThanOrEqual(record.start);
  });

  it('announces every container', () => {
    const created = vi.fn();
    addIOCDevtoolsHook({ onContainerCreated: created });

    const container = new Container();

    expect(created).toHaveBeenCalledWith(container);
  });

  it('stops notifying once removed', () => {
    const observer = vi.fn();
    const detach = addIOCDevtoolsHook({ onResolved: observer });

    detach();

    const container = new Container();
    container.bind(Service);
    container.get(Service);

    expect(observer).not.toHaveBeenCalled();
    expect(getIOCDevtoolsHook()).toBeUndefined();
  });

  it('tolerates an observer that only implements one hook', () => {
    addIOCDevtoolsHook({ onContainerCreated: () => undefined });

    const container = new Container();
    container.bind(Service);

    expect(() => container.get(Service)).not.toThrow();
  });

  it('replaces everything when the deprecated setter is used', () => {
    const evicted = vi.fn();
    const winner = vi.fn();

    addIOCDevtoolsHook({ onResolved: evicted });
    setIOCDevtoolsHook({ onResolved: winner });

    const container = new Container();
    container.bind(Service);
    container.get(Service);

    expect(evicted).not.toHaveBeenCalled();
    expect(winner).toHaveBeenCalled();
  });
});
