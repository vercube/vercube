import { Inject } from '@vercube/di';
import { addRoute, createRouter, findRoute } from 'rou3';
import { compileRouter } from 'rou3/compiler';
import { RouterAfterInitHook } from '../../Hooks/Router/RouterAfterInitHook';
import { RouterBeforeInitHook } from '../../Hooks/Router/RouterBeforeInitHook';
import { HooksService } from '../Hooks/HooksService';
import type { RouterTypes } from '../../Types/RouterTypes';
import type { RouterContext } from 'rou3';

/**
 * Router service responsible for managing application routes
 *
 * This class provides functionality to initialize the router,
 * register routes, and resolve incoming requests to their
 * appropriate handlers.
 */
export class Router {
  /**
   * Service for triggering application hooks
   */
  @Inject(HooksService)
  private gHooksService!: HooksService;

  /**
   * Internal router context that stores all registered routes
   * @private
   */
  private fRouterContext!: RouterContext<RouterTypes.RouterHandler>;

  /**
   * Flat list of registered routes (rou3 cannot be enumerated).
   * @private
   */
  private fRoutes: RouterTypes.Route[] = [];

  /**
   * JIT-compiled matcher for routes with parameters, built on first use.
   *
   * rou3 walks its trie for a parameterised path, which means splitting the
   * path into segments - and therefore allocating - on every request. Its
   * compiler turns the same route table into a generated function: measured on
   * a 228-route table, `/id/:id` matches 2.1x faster and a path with three
   * parameters 4.4x faster, and the result is identical.
   *
   * `undefined` means not built yet, `null` means the runtime refused to
   * compile.
   * @private
   */
  private fCompiledMatcher:
    | ((method: string, path: string) => RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined)
    | null
    | undefined;

  /**
   * Route revision the compiled matcher was built from, so a route registered
   * afterwards invalidates it.
   * @private
   */
  private fCompiledRevision = -1;

  /**
   * Set once the runtime has refused to compile, which it will keep doing.
   * Without it every route registered afterwards would raise and swallow the
   * same error again.
   * @private
   */
  private fCompilerUnavailable = false;

  /**
   * Lookup tables for routes without parameters, one per HTTP method.
   *
   * Most routes of a real application are static, and a map hit is far cheaper
   * than walking rou3's trie - which has to split the path into segments, and
   * therefore allocate, on every request. Nesting the maps per method keeps the
   * lookup key the pathname itself, so no key string has to be built either.
   *
   * @private
   */
  private fStaticRoutes: Map<string, Map<string, RouterTypes.RouteMatched<RouterTypes.RouterHandler>>> = new Map();

  /**
   * Counter bumped whenever the route table changes, so introspection can
   * cache a described route list and know when it went stale.
   * @private
   */
  private fRevision: number = 0;

  /**
   * All routes registered in this router, in registration order.
   */
  public get routes(): readonly RouterTypes.Route[] {
    return this.fRoutes;
  }

  /**
   * Revision of the route table. Changes on every registration and on reset.
   */
  public get revision(): number {
    return this.fRevision;
  }

  /**
   * Registers a new route in the router
   *
   * @param {RouterTypes.Route} route - The route configuration to add
   * @throws {Error} If router is not initialized
   */
  public addRoute(route: RouterTypes.Route): void {
    if (!this.fRouterContext) {
      throw new Error('Router not initialized. Please call init() before adding routes.');
    }

    const method = route.method.toUpperCase();

    // Resolved once at registration time so nothing on the request path has to
    // build a span name or look the route template back up. `@Get` registers
    // GET and HEAD through two separate `prepareHandler` calls, so this never
    // overwrites another method's values.
    route.handler.path = route.path;
    route.handler.spanName = `${method} ${route.path}`;

    addRoute(this.fRouterContext, method, route.path, route.handler);
    this.fRoutes.push(route);
    this.fRevision++;

    if (isStaticPath(route.path)) {
      let byPath = this.fStaticRoutes.get(method);

      if (!byPath) {
        byPath = new Map();
        this.fStaticRoutes.set(method, byPath);
      }

      // The matched object is immutable for static routes (no params), so a
      // single instance can be shared by every request hitting this route.
      byPath.set(normalizePath(route.path), { data: route.handler });
    }
  }

  /**
   * Initializes the router and triggers related hooks
   *
   * This method creates a new router context and triggers
   * the before and after initialization hooks.
   */
  public initialize(): void {
    // trigger before init hook
    this.gHooksService.trigger(RouterBeforeInitHook);

    this.fRouterContext = createRouter<RouterTypes.RouterHandler>();
    this.fRoutes = [];
    this.fStaticRoutes.clear();
    this.fRevision++;

    // trigger after init hook
    this.gHooksService.trigger(RouterAfterInitHook);
  }

  /**
   * Resolves a route based on the HTTP method and path
   *
   * @param {RouterTypes.RouteFind} route - The route to resolve
   * @returns {RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined} The matched route or undefined if no match found
   */
  public resolve(route: RouterTypes.RouteFind): RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined {
    let pathname = route.path;
    if (/^https?:\/\//i.test(pathname)) {
      try {
        pathname = new URL(pathname).pathname;
      } catch {
        // keep pathname as-is (e.g. malformed absolute URL)
      }
    }

    return findRoute(this.fRouterContext, route.method.toUpperCase(), pathname);
  }

  /**
   * Resolves a route from an already normalized method and pathname.
   *
   * This is the variant used on the request hot path: it skips the absolute-URL
   * normalization and the `toUpperCase()` of {@link Router.resolve} because the
   * server hands over a method that is already uppercase and a bare pathname.
   *
   * @param {string} method - Uppercase HTTP method.
   * @param {string} pathname - Request pathname, without query string.
   * @returns {RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined} The matched route or undefined if no match found
   */
  public match(method: string, pathname: string): RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined {
    const byPath = this.fStaticRoutes.get(method);

    if (byPath !== undefined) {
      const staticRoute = byPath.get(pathname);

      if (staticRoute !== undefined) {
        return staticRoute;
      }

      const normalized = normalizePath(pathname);

      if (normalized !== pathname) {
        const normalizedRoute = byPath.get(normalized);

        if (normalizedRoute !== undefined) {
          return normalizedRoute;
        }
      }
    }

    const matcher = this.compiledMatcher();

    return matcher === null ? findRoute(this.fRouterContext, method, pathname) : matcher(method, pathname);
  }

  /**
   * Returns the compiled matcher, building it when the route table has changed.
   *
   * Compilation goes through `new Function`, which a runtime with a strict
   * content security policy - a Cloudflare Worker, for one - refuses. That is
   * not an error: the trie walk is the fallback, and the refusal is remembered
   * so the attempt is made once rather than per request.
   *
   * @returns The compiled matcher, or null when this runtime cannot compile one.
   * @private
   */
  private compiledMatcher():
    | ((method: string, path: string) => RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined)
    | null {
    if (this.fCompilerUnavailable) {
      return null;
    }

    if (this.fCompiledMatcher !== undefined && this.fCompiledRevision === this.fRevision) {
      return this.fCompiledMatcher;
    }

    this.fCompiledRevision = this.fRevision;

    try {
      this.fCompiledMatcher = compileRouter(this.fRouterContext);
    } catch {
      this.fCompilerUnavailable = true;
      this.fCompiledMatcher = undefined;

      return null;
    }

    return this.fCompiledMatcher;
  }
}

/**
 * Tells whether a route path contains no parameter or wildcard segments.
 *
 * @param {string} path - The registered route path.
 * @returns {boolean} True when the path can be matched by exact comparison.
 */
function isStaticPath(path: string): boolean {
  return !path.includes(':') && !path.includes('*');
}

/**
 * Normalizes a path so that registration and lookup agree.
 *
 * This mirrors what rou3 does when it splits a path into segments: a leading
 * slash is implied and an empty trailing segment is dropped, which makes
 * `/users` and `/users/` the same route.
 *
 * @param {string} path - The path to normalize.
 * @returns {string} The path with a leading slash and without a trailing one.
 */
function normalizePath(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  return withLeading.length > 1 && withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}
