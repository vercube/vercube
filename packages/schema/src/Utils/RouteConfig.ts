import { SchemaBodyResolver } from '../Resolvers/SchemaBodyResolver';
import { SchemaDefaultsResolver } from '../Resolvers/SchemaDefaultsResolver';
import { SchemaHeaderResolver, SchemaQueryParamResolver } from '../Resolvers/SchemaNamedArgsResolver';
import { SchemaPathParamsResolver } from '../Resolvers/SchemaPathParamsResolver';
import { SchemaQueryParamsResolver } from '../Resolvers/SchemaQueryParamsResolver';
import { toOpenApiPath } from './OpenApiPath';
import type { RouteContext } from '../Resolvers/SchemaDefaultsResolver';
import type { SchemaWarn } from './StandardSchema';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

/**
 * Options accepted by `@Schema`: everything in a route config except what
 * the route decorator already defines. `responses` defaults to what
 * `@Status`, `@Redirect`, `@SetHeader` and `@Sse` declare.
 */
export type SchemaRouteOptions = Omit<RouteConfig, 'method' | 'path' | 'responses'> & {
  responses?: RouteConfig['responses'];
};

/**
 * Builds the OpenAPI route config for a controller method.
 *
 * @param metadata - The metadata of the method.
 * @param options - Options passed to `@Schema`.
 * @param warn - Reports a validation schema that cannot be documented.
 * @param controllerPath - Path the controller is served at in this application, when it is known.
 * @param context - What the registry knows about the route, used for derived defaults.
 * @returns The route config, or undefined when the method has no route decorator.
 */
export function createRouteConfig(
  metadata: MetadataTypes.Method | undefined,
  options: SchemaRouteOptions,
  warn?: SchemaWarn,
  controllerPath?: string,
  context?: RouteContext,
): RouteConfig | undefined {
  // OpenAPI 3.0 path items have no `connect` operation
  if (!metadata?.method || !metadata.url || metadata.method.toUpperCase() === 'CONNECT') {
    return undefined;
  }

  // The metadata only knows the path `@Controller()` declares; an application
  // may serve the controller elsewhere with `setControllerPath()`.
  const url =
    controllerPath !== undefined && metadata.path !== undefined
      ? `${controllerPath.replace(/\/$/, '')}/${metadata.path.replace(/^\//, '')}`
      : metadata.url;

  const openApiPath = toOpenApiPath(url);
  const path = openApiPath.path;

  const schema: DeepPartial<RouteConfig> = {
    method: metadata.method.toLowerCase() as any,
    path,
    ...(options as any),
    // `responses` is required by OpenAPI, derived from the route when `@Schema` has none
    responses: options?.responses ?? { 200: { description: 'OK' } },
  };

  if (context) {
    SchemaDefaultsResolver(metadata, (options ?? {}) as Partial<RouteConfig>, schema, context);
  }

  SchemaPathParamsResolver(openApiPath, metadata, schema);
  SchemaBodyResolver(metadata, schema, warn);
  SchemaQueryParamsResolver(metadata, schema, warn);
  SchemaQueryParamResolver(metadata, schema, warn);
  SchemaHeaderResolver(metadata, schema, warn);

  return schema as RouteConfig;
}
