import type { IOC } from './IOCTypes';

/**
 * Types describing a container's contents.
 *
 * The description is built from binding metadata only. Nothing is resolved, so
 * inspecting a container never constructs a service the application itself
 * never asked for.
 */
export namespace Describe {
  /** How a binding produces its value. */
  export type ServiceKind = 'singleton' | 'transient' | 'instance';

  /** One `@Inject` / `@InjectOptional` declaration. */
  export interface Dependency {
    /** Id of the service this resolves to, or `unbound:Name` when nothing is bound. */
    id: string;
    /** Display name of the dependency key. */
    name: string;
    /** Property the dependency is injected into. */
    property: string;
    /** Whether the declaration was `@InjectOptional`. */
    optional: boolean;
    /** Whether something is actually bound under the key. */
    bound: boolean;
  }

  /** A service in the container. */
  export interface ServiceNode {
    /** Unique id. The display name, suffixed with `#n` when names collide. */
    id: string;
    /** Display name of the binding key. */
    name: string;
    kind: ServiceKind;
    /**
     * Category of the service.
     *
     * The container itself can only tell a class from a plain value; anything
     * finer - controller, middleware, plugin - comes from the `annotate`
     * callback, because only the framework layer knows what those are.
     */
    role: string;
    /** Implementation class name, when it differs from the key. */
    implementation: string | null;
    /** Whether an instance already exists. */
    instantiated: boolean;
    /** Whether the key is a symbol. */
    symbol: boolean;
    dependencies: Dependency[];
    /** Number of services depending on this one. */
    dependents: number;
    /** Extra fields contributed by `annotate`. */
    [extra: string]: unknown;
  }

  /** A directed dependency edge. */
  export interface ServiceEdge {
    from: string;
    to: string;
    property: string;
    optional: boolean;
  }

  /** Everything known about a container's bindings. */
  export interface ContainerDescription {
    /** Container label, when one was given. */
    context?: string;
    nodes: ServiceNode[];
    edges: ServiceEdge[];
    /** Dependency cycles, each as the ordered ids forming the loop. */
    cycles: string[][];
    /** Number of services that were never instantiated. */
    unusedCount: number;
  }

  /** What `annotate` is told about the node it is classifying. */
  export interface AnnotateContext {
    key: IOC.ServiceKey;
    def: Readonly<IOC.ServiceDef>;
    /** Constructor behind the binding, or null for plain values. */
    ctor: (Function & { prototype: unknown }) | null;
  }

  /** Options for {@link describeContainer}. */
  export interface Options {
    /**
     * Refines a node before it is added to the description. Typically sets
     * `role` and attaches framework-specific fields.
     */
    annotate?: (node: ServiceNode, context: AnnotateContext) => void;
  }
}
