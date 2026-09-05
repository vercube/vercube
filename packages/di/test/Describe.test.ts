import { beforeEach, describe, expect, it } from 'vitest';
import { Inject } from '../src/Decorators/Inject';
import { InjectOptional } from '../src/Decorators/InjectOptional';
import { Container } from '../src/Domain/Container';
import {
  describeContainer,
  describeImplementation,
  describeKey,
  resolveConstructor,
  toServiceKind,
} from '../src/Domain/Describe';
import { IOC } from '../src/Types/IOCTypes';
import { Identity } from '../src/Utils/Utils';

abstract class Missing {}

class Repository {}

class Service {
  @Inject(Repository)
  public readonly repository!: Repository;

  @InjectOptional(Missing)
  public readonly missing!: Missing | null;
}

// String keys, because a class-to-class cycle cannot be written directly: the
// second class is still in its temporal dead zone when the first decorator runs.
class Right {
  @Inject('left')
  public readonly left!: unknown;
}

class Left {
  @Inject('right')
  public readonly right!: unknown;
}

describe('describeKey', () => {
  it.each([
    [Repository, 'Repository'],
    ['literal', 'literal'],
  ])('names %s', (key, expected) => {
    expect(describeKey(key as never)).toBe(expected);
  });

  it('uses a symbol description', () => {
    expect(describeKey(Identity('Config'))).toBe('Config');
  });

  it('names an instance by its constructor', () => {
    expect(describeKey(new Repository() as never)).toBe('Repository');
  });

  it('falls back for anything it cannot name', () => {
    expect(describeKey(undefined as never)).toBe('Unknown');
    expect(describeKey(Object.create(null) as never)).toBe('Object');
  });

  it('falls back for an anonymous class', () => {
    expect(describeKey((() => class {})() as never)).toBe('Anonymous');
  });
});

describe('describeImplementation', () => {
  it('is null when the value is the key', () => {
    expect(describeImplementation(Repository, Repository)).toBeNull();
  });

  it('names a different implementation', () => {
    expect(describeImplementation(Missing, Repository)).toBe('Repository');
  });

  it('is null for a plain value', () => {
    expect(describeImplementation('key', 42)).toBeNull();
  });
});

describe('resolveConstructor', () => {
  it('ignores plain objects, which are configuration rather than services', () => {
    expect(resolveConstructor({ serviceKey: 'k', serviceValue: { a: 1 }, type: IOC.ServiceFactoryType.INSTANCE })).toBeNull();
  });

  it('finds the constructor of an instance', () => {
    const def = { serviceKey: Repository, serviceValue: new Repository(), type: IOC.ServiceFactoryType.INSTANCE };

    expect(resolveConstructor(def)).toBe(Repository);
  });
});

describe('toServiceKind', () => {
  it.each([
    [IOC.ServiceFactoryType.CLASS_SINGLETON, 'singleton'],
    [IOC.ServiceFactoryType.CLASS, 'transient'],
    [IOC.ServiceFactoryType.INSTANCE, 'instance'],
  ])('maps %s', (type, expected) => {
    expect(toServiceKind(type)).toBe(expected);
  });
});

describe('describeContainer', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(Repository);
    container.bind(Service);
  });

  it('describes every binding without constructing anything', () => {
    const description = describeContainer(container);

    expect(description.nodes.map((node) => node.name)).toEqual(expect.arrayContaining(['Repository', 'Service']));
    expect(container.hasInstance(Service)).toBe(false);
  });

  it('records dependency edges', () => {
    const edges = describeContainer(container).edges;

    expect(edges).toContainEqual({ from: 'Service', to: 'Repository', property: 'repository', optional: false });
  });

  it('marks an unbound dependency without producing an edge', () => {
    const service = describeContainer(container).nodes.find((node) => node.name === 'Service')!;
    const missing = service.dependencies.find((dependency) => dependency.property === 'missing')!;

    expect(missing).toMatchObject({ bound: false, optional: true, id: 'unbound:Missing' });
    expect(describeContainer(container).edges.some((edge) => edge.to.startsWith('unbound:'))).toBe(false);
  });

  it('counts dependents', () => {
    const repository = describeContainer(container).nodes.find((node) => node.name === 'Repository')!;

    expect(repository.dependents).toBe(1);
  });

  it('reports what has been instantiated', () => {
    container.get(Repository);

    const repository = describeContainer(container).nodes.find((node) => node.name === 'Repository')!;

    expect(repository.instantiated).toBe(true);
  });

  it('detects a cycle once, however it is entered', () => {
    const cyclic = new Container();
    cyclic.bind('left', Left);
    cyclic.bind('right', Right);

    const cycles = describeContainer(cyclic).cycles;

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(expect.arrayContaining(['left', 'right']));
  });

  it('lets a caller annotate nodes', () => {
    const description = describeContainer(container, {
      annotate: (node) => {
        if (node.name === 'Service') {
          node.role = 'application';
        }
      },
    });

    expect(description.nodes.find((node) => node.name === 'Service')!.role).toBe('application');
  });

  it('disambiguates colliding names', () => {
    const clashing = new Container();
    clashing.bind(Identity('Thing'), class Thing {});
    clashing.bind(Identity('Thing'), class Thing {});
    clashing.bindInstance('Thing', {});

    const ids = describeContainer(clashing).nodes.map((node) => node.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('counts services nothing ever resolved', () => {
    expect(describeContainer(container).unusedCount).toBeGreaterThan(0);
  });
});
