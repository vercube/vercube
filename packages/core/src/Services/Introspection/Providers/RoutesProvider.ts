import { Inject } from '@vercube/di';
import { Router } from '../../Router/Router';
import type { IntrospectionTypes } from '../../../Types/IntrospectionTypes';
import type { MetadataTypes } from '../../../Types/MetadataTypes';
import type { RouterTypes } from '../../../Types/RouterTypes';

/**
 * Describes the application's route table.
 *
 * One entry per registration, so `@Get` shows up as both GET and HEAD. Folding
 * the pair into one row is a presentation choice and is left to whoever renders
 * the list.
 */
export class RoutesProvider implements IntrospectionTypes.Provider<IntrospectionTypes.RouteDescription[]> {
  /** @inheritdoc */
  public readonly id = 'routes';

  /** @inheritdoc */
  public readonly title = 'Routes';

  @Inject(Router)
  private readonly gRouter!: Router;

  /** @inheritdoc */
  public revision(): number {
    return this.gRouter.revision;
  }

  /** @inheritdoc */
  public describe(): IntrospectionTypes.RouteDescription[] {
    return this.gRouter.routes
      .map((route) => describeRoute(route))
      .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  }
}

/**
 * Describes a single route registration.
 *
 * @param route - Raw entry from the router
 * @returns A serialisable description
 */
export function describeRoute(route: RouterTypes.Route): IntrospectionTypes.RouteDescription {
  const handler = route.handler;
  const instance = handler.instance as object | undefined;
  const prototype = instance ? (Object.getPrototypeOf(instance) as { __metadata?: MetadataTypes.Ctx }) : undefined;

  return {
    id: `${route.method} ${route.path}`,
    method: route.method,
    path: route.path,
    controller: handler.controller ?? instance?.constructor?.name ?? 'Unknown',
    handler: handler.propertyName,
    basePath: prototype?.__metadata?.__controller?.path,
    args: (handler.args ?? []).map((arg) => describeArg(arg)),
    middlewares: [
      ...(handler.middlewares?.beforeMiddlewares ?? []).map((definition) => describeMiddleware(definition, 'before')),
      ...(handler.middlewares?.afterMiddlewares ?? []).map((definition) => describeMiddleware(definition, 'after')),
    ],
    actions: handler.actions?.length ?? 0,
    simple: handler.simple === true,
  };
}

/**
 * Describes one handler argument.
 *
 * @param arg - Argument metadata produced by a parameter decorator
 * @returns A serialisable description
 */
function describeArg(arg: MetadataTypes.Arg): IntrospectionTypes.RouteArg {
  return {
    idx: arg.idx,
    type: arg.type,
    name: typeof arg.data?.name === 'string' ? arg.data.name : undefined,
    validated: Boolean(arg.validate && arg.validationSchema),
  };
}

/**
 * Describes one middleware attached to a route.
 *
 * @param definition - Resolved middleware definition
 * @param phase - Lifecycle phase the middleware runs in
 * @returns A serialisable description
 */
function describeMiddleware(
  definition: RouterTypes.MiddlewareDefinition,
  phase: 'before' | 'after',
): IntrospectionTypes.RouteMiddleware {
  return {
    name: (definition.middleware as object)?.constructor?.name ?? 'Middleware',
    phase,
    priority: definition.priority ?? 999,
    global: definition.target === '__global__',
  };
}
