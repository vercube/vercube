import { Router } from '@vercube/core';
import { Inject } from '@vercube/di';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import { readControllerPath } from '../Utils/Introspect';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { MetadataTypes, RouterTypes } from '@vercube/core';

/**
 * Turns the router's route registry into a described route list.
 */
export class RouteCollector {
  @Inject(Router)
  private readonly gRouter!: Router;

  @Inject($DevtoolsOptions)
  private readonly gOptions!: DevtoolsTypes.ResolvedOptions;

  /**
   * Describes every route registered in the application.
   * @returns routes sorted by path, then by HTTP method
   */
  public collect(): DevtoolsTypes.RouteInfo[] {
    const routes = this.gRouter.routes.map((route) => this.describe(route));

    return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  }

  /**
   * Finds the route that would handle a given method/path pair.
   * @param method HTTP method
   * @param path request pathname
   * @returns matching route description, or `undefined`
   */
  public resolve(method: string, path: string): DevtoolsTypes.RouteInfo | undefined {
    const matched = this.gRouter.resolve({ method, path });

    if (!matched?.data) {
      return undefined;
    }

    const route = this.gRouter.routes.find((candidate) => candidate.handler === matched.data);

    return route ? this.describe(route) : undefined;
  }

  /**
   * Describes a single route.
   * @param route raw route entry from the router registry
   * @returns serialisable route description
   */
  private describe(route: RouterTypes.Route): DevtoolsTypes.RouteInfo {
    const handler = route.handler;
    const instance = handler.instance as object | undefined;
    const controller = instance?.constructor?.name ?? 'Unknown';
    const prototype = instance ? (Object.getPrototypeOf(instance) as { constructor?: Function }) : null;
    const basePath = readControllerPath(prototype?.constructor as (Function & { prototype: unknown }) | null);

    return {
      id: `${route.method} ${route.path}`,
      method: route.method,
      path: route.path,
      controller,
      handler: handler.propertyName,
      args: (handler.args ?? []).map((arg) => this.describeArg(arg)),
      middlewares: [
        ...(handler.middlewares?.beforeMiddlewares ?? []).map((m) => this.describeMiddleware(m, 'before')),
        ...(handler.middlewares?.afterMiddlewares ?? []).map((m) => this.describeMiddleware(m, 'after')),
      ],
      actions: handler.actions?.length ?? 0,
      internal: route.path.startsWith(this.gOptions.path) || basePath === this.gOptions.path,
    };
  }

  /**
   * Describes a single handler argument.
   * @param arg argument metadata produced by parameter decorators
   * @returns serialisable argument description
   */
  private describeArg(arg: MetadataTypes.Arg): DevtoolsTypes.RouteArg {
    return {
      idx: arg.idx,
      type: arg.type,
      name: typeof arg.data?.name === 'string' ? arg.data.name : undefined,
      validated: Boolean(arg.validate && arg.validationSchema),
    };
  }

  /**
   * Describes a resolved middleware attached to a route.
   * @param definition resolved middleware definition
   * @param phase lifecycle phase the middleware runs in
   * @returns serialisable middleware description
   */
  private describeMiddleware(
    definition: RouterTypes.MiddlewareDefinition,
    phase: 'before' | 'after',
  ): DevtoolsTypes.RouteMiddleware {
    return {
      name: (definition.middleware as object)?.constructor?.name ?? 'Middleware',
      phase,
      priority: definition.priority ?? 999,
      global: definition.target === '__global__',
    };
  }
}
