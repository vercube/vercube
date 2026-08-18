import { Container, Inject } from '@vercube/di';
import { afterEach, describe, expect, it } from 'vitest';
import {
  finalizeBootstrapProfile,
  getBootstrapProfile,
  getObservedContainers,
  getTimingsByName,
  installBootstrapProfiler,
  resetBootstrapProfiler,
} from '../../src/Services/BootstrapProfiler';

/**
 * Burns wall time so construction intervals are measurably nested.
 * @param ms milliseconds to burn
 */
function burn(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* intentionally blocking */
  }
}

class Grandchild {
  constructor() {
    burn(4);
  }
}

class Child {
  @Inject(Grandchild)
  private gGrandchild!: Grandchild;

  constructor() {
    burn(2);
  }
}

class Parent {
  @Inject(Child)
  private gChild!: Child;
}

describe('BootstrapProfiler', () => {
  afterEach(() => {
    resetBootstrapProfiler();
  });

  it('should report an unavailable profile before anything is recorded', () => {
    const profile = getBootstrapProfile();

    expect(profile.count).toBe(0);
    expect(profile.tree).toEqual([]);
  });

  it('should observe container creation', () => {
    installBootstrapProfiler();
    const container = new Container();

    expect(getObservedContainers()).toContain(container);
  });

  it('should rebuild the construction call tree from nested intervals', () => {
    installBootstrapProfiler();

    const container = new Container();
    container.bind(Grandchild);
    container.bind(Child);
    container.bind(Parent);
    container.get(Parent);

    const profile = getBootstrapProfile();
    const parent = profile.tree.find((node) => node.name === 'Parent');
    const child = parent?.children.find((node) => node.name === 'Child');

    expect(profile.available).toBe(true);
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(child?.children.map((node) => node.name)).toContain('Grandchild');
  });

  it('should compute self time as total minus nested construction', () => {
    installBootstrapProfiler();

    const container = new Container();
    container.bind(Grandchild);
    container.bind(Child);
    container.bind(Parent);
    container.get(Parent);

    const profile = getBootstrapProfile();
    const child = profile.tree.find((node) => node.name === 'Parent')?.children.find((node) => node.name === 'Child');

    expect(child!.totalMs).toBeGreaterThanOrEqual(5);
    expect(child!.selfMs).toBeLessThan(child!.totalMs);
    expect(child!.selfMs).toBeGreaterThan(0);
  });

  it('should rank hotspots by self time', () => {
    installBootstrapProfiler();

    const container = new Container();
    container.bind(Grandchild);
    container.bind(Child);
    container.bind(Parent);
    container.get(Parent);

    const [slowest] = getBootstrapProfile().hotspots;

    expect(slowest.name).toBe('Grandchild');
    expect(getTimingsByName().get('Grandchild')?.selfMs).toBeGreaterThan(0);
  });

  it('should stop recording once the profile is finalized', () => {
    installBootstrapProfiler();

    const container = new Container();
    container.bind(Grandchild);
    container.get(Grandchild);

    const before = getBootstrapProfile().count;
    finalizeBootstrapProfile();

    container.bind(Child);
    container.get(Child);

    expect(getBootstrapProfile().count).toBe(before);
  });

  it('should not record anything once uninstalled', () => {
    resetBootstrapProfiler();

    const container = new Container();
    container.bind(Grandchild);
    container.get(Grandchild);

    expect(getBootstrapProfile().count).toBe(0);
  });
});
