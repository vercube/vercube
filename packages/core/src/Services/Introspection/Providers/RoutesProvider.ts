import { Inject } from '@vercube/di';
import { getRouteErrors } from '../../../Errors/RouteErrors';
import { isAuthMiddleware } from '../../../Utils/Utils';
import { MetadataResolver } from '../../Metadata/MetadataResolver';
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

  @Inject(MetadataResolver)
  private readonly gMetadataResolver!: MetadataResolver;

  /** @inheritdoc */
  public revision(): number {
    return this.gRouter.revision;
  }

  /** @inheritdoc */
  public describe(): IntrospectionTypes.RouteDescription[] {
    return this.gRouter.routes
      .map((route) => {
        const controller = (route.handler.instance as object | undefined)?.constructor;
        return describeRoute(route, controller ? this.gMetadataResolver.getControllerPath(controller) : undefined);
      })
      .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  }
}

/**
 * Describes a single route registration.
 *
 * @param route - Raw entry from the router
 * @param basePath - Path the controller is mounted under, when the application mounted it elsewhere
 * @returns A serialisable description
 */
export function describeRoute(route: RouterTypes.Route, basePath?: string): IntrospectionTypes.RouteDescription {
  const handler = route.handler;
  const instance = handler.instance as object | undefined;
  const prototype = instance ? (Object.getPrototypeOf(instance) as { __metadata?: MetadataTypes.Ctx }) : undefined;
  const middlewares = [...(handler.middlewares?.beforeMiddlewares ?? []), ...(handler.middlewares?.afterMiddlewares ?? [])];
  const secured = middlewares.some((definition) => isAuthMiddleware(definition.middleware));
  const throws = getRouteErrors(prototype, handler.propertyName, { args: handler.args ?? [], secured }).map(
    ({ name, status, module }) => (module ? { name, status, module } : { name, status }),
  );

  return {
    id: `${route.method} ${route.path}`,
    method: route.method,
    path: route.path,
    controller: handler.controller ?? instance?.constructor?.name ?? 'Unknown',
    handler: handler.propertyName,
    basePath: basePath ?? prototype?.__metadata?.__controller?.path,
    args: (handler.args ?? []).map((arg) => describeArg(arg)),
    middlewares: [
      ...(handler.middlewares?.beforeMiddlewares ?? []).map((definition) => describeMiddleware(definition, 'before')),
      ...(handler.middlewares?.afterMiddlewares ?? []).map((definition) => describeMiddleware(definition, 'after')),
    ],
    actions: handler.actions?.length ?? 0,
    simple: handler.simple === true,
    ...(prototype?.__metadata?.__methods?.[handler.propertyName]?.meta?.sse === true ? { sse: true } : {}),
    ...(throws.length > 0 ? { throws } : {}),
    ...(secured ? { secured: true } : {}),
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
