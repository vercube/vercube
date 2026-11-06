/**
 * Type definitions for application introspection.
 *
 * Introspection is the *structural* half of Vercube's observability story: the
 * route table, the merged configuration, the container graph, the discovered
 * source files. Unlike traces, metrics and logs, this data is low-volume,
 * request/response shaped and only changes when the application does, so it is
 * deliberately not modelled as an OpenTelemetry signal.
 */
export namespace IntrospectionTypes {
  /**
   * Contributes one named section of structural data.
   *
   * Providers are registered by whichever package owns the data: core describes
   * routes and configuration, `@vercube/di` describes the container,
   * `@vercube/schema` describes the OpenAPI document, and so on. Consumers -
   * devtools, the CLI, an audit rule - never reach into those packages
   * themselves.
   */
  export interface Provider<T = unknown> {
    /** Stable identifier, e.g. `routes`. Registering a second provider under the same id replaces the first. */
    id: string;

    /** Human-readable name, shown by consumers. */
    title: string;

    /**
     * A number that changes whenever {@link Provider.describe} would return
     * something different.
     *
     * It is what makes caching and HTTP revalidation possible: the registry
     * memoizes a described section against the revision it was built from, and
     * consumers can turn it into an `ETag`.
     */
    revision(): number;

    /** Produces the section's data. Must be JSON-serialisable. */
    describe(): T | Promise<T>;
  }

  /** A registered provider, without its data. */
  export interface Descriptor {
    id: string;
    title: string;
    revision: number;
  }

  /** A described section. */
  export interface Section<T = unknown> extends Descriptor {
    data: T;
  }

  /** Notified when a section's data has changed. */
  export type InvalidateListener = (id: string, revision: number) => void;

  /** One leaf of a flattened configuration object. */
  export interface ConfigEntry {
    /** Dotted path of the value. */
    path: string;
    /** The value, rendered as text. */
    value: string;
    /** True when the value was withheld because its key names a credential. */
    redacted?: boolean;
  }

  /** The `config` section: the merged application config and the runtime slice. */
  export interface ConfigDescription {
    app: ConfigEntry[];
    runtime: ConfigEntry[];
  }

  /** One handler argument, as declared by its parameter decorator. */
  export interface RouteArg {
    idx: number;
    /** Decorator kind: `body`, `param`, `query`, `request`, `custom`, and so on. */
    type: string;
    /** Declared name, for the decorators that take one. */
    name?: string;
    /** True when a validation schema is attached and enabled. */
    validated: boolean;
  }

  /** One middleware attached to a route. */
  export interface RouteMiddleware {
    name: string;
    phase: 'before' | 'after';
    priority: number;
    /** True when the middleware is registered application-wide. */
    global: boolean;
  }

  /** One route registration. `@Get` produces two: GET and HEAD. */
  export interface RouteDescription {
    /** `${method} ${path}`. */
    id: string;
    method: string;
    /** Route template, e.g. `/users/:id`. */
    path: string;
    controller: string;
    handler: string;
    /** Base path declared by `@Controller()`. */
    basePath?: string;
    args: RouteArg[];
    middlewares: RouteMiddleware[];
    /** Number of response actions (`@Status`, `@Redirect`, `@SetHeader`). */
    actions: number;
    /** True when the route takes the allocation-free fast path. */
    simple: boolean;
    /** Set on `@Sse()` routes, which answer with `text/event-stream`. */
    sse?: true;
    /**
     * Errors the route answers with, sorted by status: those declared with
     * `@Throws()` on the handler or its controller, and those the framework
     * throws itself (a 400 for a validated or parsed input, a 401 and a 403
     * for a secured route). Absent when there are none.
     */
    throws?: RouteThrows[];
    /** Set when an authentication middleware (`@Auth()`) guards the route. */
    secured?: true;

    /**
     * Set on infrastructure routes that opt out of application-wide
     * middlewares: health probes, devtools, the scheduler trigger. Absent
     * on application routes.
     */
    internal?: true;
  }

  /** One error a route answers with. */
  export interface RouteThrows {
    /** Class name of the error. */
    name: string;
    status: number;
    /** Set for an implicit error: the module its class is imported from. */
    module?: string;
  }

  /** One source file the scanner attributed to a class. */
  export interface DiscoveredClass {
    /** Class name, matching the container binding key. */
    name: string;
    /** Path relative to the project root. */
    path: string;
  }

  /** The `discovery` section: what the build-time scanner found. */
  export interface DiscoveryDescription {
    /** Project root the paths are relative to. */
    root: string;
    /** When the manifest was written. */
    generatedAt: string;
    controllers: DiscoveredClass[];
    services: DiscoveredClass[];
    middlewares: DiscoveredClass[];
    /** Routes as the scanner read them from the source, before the router saw them. */
    routes: { method: string; path: string; controller: string; file: string }[];
  }

  /** The `plugins` section. */
  export interface PluginsDescription {
    /** Plugins registered through the registry or the config. */
    plugins: string[];
    /** Middlewares applied to every route. */
    globalMiddlewares: { name: string; priority: number }[];
  }
}
