import { Container, Identity, Inject, InjectOptional } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { GraphCollector } from '../../src/Services/GraphCollector';
import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';

const $Config = Identity('AppConfig');

class Missing {}

class Leaf {}

class BaseService {
  @Inject(Leaf)
  protected gLeaf!: Leaf;
}

class Alpha extends BaseService {
  @Inject($Config)
  private gConfig!: unknown;

  @InjectOptional(Missing)
  private gMissing!: Missing | null;
}

class Beta {
  @Inject(Alpha)
  private gAlpha!: Alpha;
}

class Ping {
  @Inject('Pong' as never)
  private gPong!: unknown;
}

class Pong {
  @Inject(Ping)
  private gPing!: Ping;
}

/**
 * Builds a graph snapshot from a container wired for the test.
 * @param wire container setup
 * @returns the collected graph
 */
function collect(wire: (container: Container) => void): DevtoolsTypes.Graph {
  const container = new Container();
  wire(container);
  container.bind(GraphCollector);

  return container.get(GraphCollector).collect();
}

describe('GraphCollector', () => {
  it('should describe every binding without instantiating it', () => {
    const graph = collect((container) => {
      container.bind(Leaf);
      container.bind(Alpha);
      container.bindInstance($Config, { debug: true });
    });

    const leaf = graph.nodes.find((node) => node.name === 'Leaf');
    const config = graph.nodes.find((node) => node.name === 'AppConfig');

    expect(leaf?.instantiated).toBe(false);
    expect(config?.kind).toBe('instance');
    expect(config?.symbol).toBe(true);
    expect(config?.role).toBe('value');
  });

  it('should include dependencies inherited from base classes', () => {
    const graph = collect((container) => {
      container.bind(Leaf);
      container.bind(Alpha);
      container.bindInstance($Config, {});
    });

    const alpha = graph.nodes.find((node) => node.name === 'Alpha');

    expect(alpha?.dependencies.map((dependency) => dependency.name).sort()).toEqual(['AppConfig', 'Leaf', 'Missing']);
  });

  it('should flag dependencies that are not bound anywhere', () => {
    const graph = collect((container) => {
      container.bind(Leaf);
      container.bind(Alpha);
      container.bindInstance($Config, {});
    });

    const missing = graph.nodes.find((node) => node.name === 'Alpha')?.dependencies.find((d) => d.name === 'Missing');

    expect(missing).toMatchObject({ bound: false, optional: true });
    expect(graph.edges.some((edge) => edge.to === 'Missing')).toBe(false);
  });

  it('should count dependents', () => {
    const graph = collect((container) => {
      container.bind(Leaf);
      container.bind(Alpha);
      container.bind(Beta);
      container.bindInstance($Config, {});
    });

    expect(graph.nodes.find((node) => node.name === 'Alpha')?.dependents).toBe(1);
    expect(graph.nodes.find((node) => node.name === 'Beta')?.dependents).toBe(0);
  });

  it('should detect dependency cycles once each', () => {
    const graph = collect((container) => {
      container.bind('Pong' as never, Pong as never);
      container.bind(Ping);
    });

    expect(graph.cycles).toHaveLength(1);
    expect(graph.cycles[0]).toHaveLength(2);
    expect(graph.cycles[0].sort()).toEqual(['Ping', 'Pong']);
  });

  it('should report no cycles for an acyclic graph', () => {
    const graph = collect((container) => {
      container.bind(Leaf);
      container.bind(Alpha);
      container.bind(Beta);
      container.bindInstance($Config, {});
    });

    expect(graph.cycles).toEqual([]);
  });

  it('should give colliding key names unique ids', () => {
    const graph = collect((container) => {
      container.bindInstance(Identity('Duplicate'), {});
      container.bindInstance(Identity('Duplicate'), {});
    });

    const ids = graph.nodes.filter((node) => node.name === 'Duplicate').map((node) => node.id);

    expect(new Set(ids).size).toBe(2);
  });
});
