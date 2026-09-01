import { IOC } from '../Types/IOCTypes';
import { IOCEngine } from './Engine';
import type { Describe } from '../Types/DescribeTypes';
import type { Container } from './Container';
import type { IClassDep } from './Engine';

/** Prototype of a plain object; the stop condition when walking prototype chains. */
const ROOT_PROTO: object = Object.getPrototypeOf({});

/**
 * Produces a readable label for any service key.
 *
 * @param key - Service key from a `bind*` call
 * @returns Display name for the key
 */
export function describeKey(key: IOC.ServiceKey): string {
  if (typeof key === 'symbol') {
    return key.description ?? 'Symbol()';
  }

  if (typeof key === 'string') {
    return key;
  }

  if (typeof key === 'function') {
    return (key as { name?: string }).name || 'Anonymous';
  }

  if (typeof key === 'object' && key !== null) {
    return (key as { constructor?: { name?: string } }).constructor?.name ?? 'Object';
  }

  return 'Unknown';
}

/**
 * Names the value a key was bound to, or `null` when it adds no information.
 *
 * @param key - Service key
 * @param value - Bound implementation or instance
 * @returns Implementation name, or null
 */
export function describeImplementation(key: IOC.ServiceKey, value: unknown): string | null {
  if (value === key) {
    return null;
  }

  if (typeof value === 'function') {
    const name = (value as { name?: string }).name;
    return name && name !== describeKey(key) ? name : null;
  }

  if (typeof value === 'object' && value !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    return name && name !== describeKey(key) ? name : null;
  }

  return null;
}

/**
 * Resolves the class constructor behind a service definition.
 *
 * @param def - Service definition from the container
 * @returns The constructor, or null for plain values
 */
export function resolveConstructor(def: Readonly<IOC.ServiceDef>): (Function & { prototype: unknown }) | null {
  const value = def.serviceValue;

  if (typeof value === 'function') {
    return value as Function & { prototype: unknown };
  }

  if (typeof value === 'object' && value !== null) {
    const ctor = (value as { constructor?: Function }).constructor;

    // Plain objects and arrays are configuration values, not services.
    if (ctor === Object || ctor === Array || typeof ctor !== 'function') {
      return null;
    }

    return ctor as Function & { prototype: unknown };
  }

  return null;
}

/**
 * Collects every injection declaration of a class, inherited ones included.
 *
 * @param ctor - Class constructor to inspect
 * @returns Dependency declarations, nearest prototype first
 */
export function collectClassDeps(ctor: (Function & { prototype: unknown }) | null): IClassDep[] {
  if (!ctor?.prototype) {
    return [];
  }

  const deps: IClassDep[] = [];
  const seen = new Set<string>();
  let proto: object | null = ctor.prototype as object;

  while (proto && proto !== ROOT_PROTO) {
    const entry = IOCEngine.getEntryForClass({ prototype: proto } as unknown as IOC.Newable<unknown>);

    for (const dep of entry?.deps ?? []) {
      if (seen.has(dep.propertyName)) {
        continue;
      }

      seen.add(dep.propertyName);
      deps.push(dep);
    }

    proto = Object.getPrototypeOf(proto);
  }

  return deps;
}

/**
 * Maps a binding's factory type onto its description kind.
 *
 * @param type - Factory type recorded by the container
 * @returns The matching kind
 */
export function toServiceKind(type: IOC.ServiceFactoryType): Describe.ServiceKind {
  switch (type) {
    case IOC.ServiceFactoryType.CLASS_SINGLETON: {
      return 'singleton';
    }
    case IOC.ServiceFactoryType.CLASS: {
      return 'transient';
    }
    default: {
      return 'instance';
    }
  }
}

/**
 * Builds a serialisable description of a container.
 *
 * Reads `container.services`, which is binding metadata, never
 * `getAllServices()`, which would construct every registered service. An
 * inspector that instantiates what it inspects is not an inspector.
 *
 * @param container - The container to describe
 * @param options - Optional annotation callback
 * @returns Nodes, edges, cycles and the unused-service count
 */
export function describeContainer(container: Container, options: Describe.Options = {}): Describe.ContainerDescription {
  const services = container.services;
  const ids = buildIdMap(services);

  const nodes: Describe.ServiceNode[] = [];
  const edges: Describe.ServiceEdge[] = [];
  const dependentCounts = new Map<string, number>();

  for (const [key, def] of services) {
    const id = ids.get(key)!;
    const name = describeKey(key);
    const ctor = resolveConstructor(def);
    const dependencies: Describe.Dependency[] = [];

    for (const dep of collectClassDeps(ctor)) {
      const targetId = ids.get(dep.dependency);
      const targetName = describeKey(dep.dependency);
      const optional = dep.type === IOC.DependencyType.OPTIONAL;

      dependencies.push({
        id: targetId ?? `unbound:${targetName}`,
        name: targetName,
        property: dep.propertyName,
        optional,
        bound: targetId !== undefined,
      });

      if (targetId !== undefined) {
        edges.push({ from: id, to: targetId, property: dep.propertyName, optional });
        dependentCounts.set(targetId, (dependentCounts.get(targetId) ?? 0) + 1);
      }
    }

    const node: Describe.ServiceNode = {
      id,
      name,
      kind: toServiceKind(def.type),
      role: ctor ? 'service' : 'value',
      implementation: describeImplementation(key, def.serviceValue),
      instantiated: def.type === IOC.ServiceFactoryType.INSTANCE || container.hasInstance(key),
      symbol: typeof key === 'symbol',
      dependencies,
      dependents: 0,
    };

    options.annotate?.(node, { key, def, ctor });
    nodes.push(node);
  }

  for (const node of nodes) {
    node.dependents = dependentCounts.get(node.id) ?? 0;
  }

  return {
    context: container.context,
    nodes,
    edges,
    cycles: findCycles(nodes, edges),
    unusedCount: nodes.filter((node) => !node.instantiated).length,
  };
}

/**
 * Assigns a stable, unique id to every service key.
 *
 * @param services - The container's service map
 * @returns Map of service key to unique id
 */
function buildIdMap(services: ReadonlyMap<IOC.ServiceKey, Readonly<IOC.ServiceDef>>): Map<IOC.ServiceKey, string> {
  const ids = new Map<IOC.ServiceKey, string>();
  const used = new Map<string, number>();

  for (const key of services.keys()) {
    const base = describeKey(key);
    const seen = used.get(base) ?? 0;

    used.set(base, seen + 1);
    ids.set(key, seen === 0 ? base : `${base}#${seen}`);
  }

  return ids;
}

/**
 * Finds dependency cycles by depth-first search with colour marking.
 *
 * Each cycle is reported once, rotated to start at its lexicographically
 * smallest member so the same loop always serialises identically.
 *
 * @param nodes - Graph nodes
 * @param edges - Graph edges
 * @returns One ordered id list per cycle
 */
function findCycles(nodes: Describe.ServiceNode[], edges: Describe.ServiceEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const state = new Map<string, 'visiting' | 'done'>();
  const path: string[] = [];
  const found = new Map<string, string[]>();

  const visit = (id: string): void => {
    state.set(id, 'visiting');
    path.push(id);

    for (const next of adjacency.get(id) ?? []) {
      const nextState = state.get(next);

      if (nextState === 'visiting') {
        const cycle = path.slice(path.indexOf(next));
        const smallest = cycle.indexOf([...cycle].sort()[0]);
        const normalised = [...cycle.slice(smallest), ...cycle.slice(0, smallest)];

        found.set(normalised.join(' '), normalised);
        continue;
      }

      if (nextState === undefined) {
        visit(next);
      }
    }

    path.pop();
    state.set(id, 'done');
  };

  for (const node of nodes) {
    if (!state.has(node.id)) {
      visit(node.id);
    }
  }

  return [...found.values()];
}
