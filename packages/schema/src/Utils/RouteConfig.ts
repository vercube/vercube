import { SchemaBodyResolver } from '../Resolvers/SchemaBodyResolver';
import { SchemaHeaderResolver, SchemaQueryParamResolver } from '../Resolvers/SchemaNamedArgsResolver';
import { SchemaPathParamsResolver } from '../Resolvers/SchemaPathParamsResolver';
import { SchemaQueryParamsResolver } from '../Resolvers/SchemaQueryParamsResolver';
import { toOpenApiPath } from './OpenApiPath';
import type { SchemaWarn } from './StandardSchema';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

/**
 * Options accepted by `@Schema`: everything in a route config except what
 * the route decorator already defines.
 */
export type SchemaRouteOptions = Omit<RouteConfig, 'method' | 'path'>;

/**
 * Builds the OpenAPI route config for a controller method.
 *
 * @param metadata - The metadata of the method.
 * @param options - Options passed to `@Schema`.
 * @param warn - Reports a validation schema that cannot be documented.
 * @param controllerPath - Path the controller is served at in this application, when it is known.
 * @returns The route config, or undefined when the method has no route decorator.
 */
export function createRouteConfig(
  metadata: MetadataTypes.Method | undefined,
  options: SchemaRouteOptions,
  warn?: SchemaWarn,
  controllerPath?: string,
): RouteConfig | undefined {
  if (!metadata?.method || !metadata.url) {
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
    // `responses` is required by OpenAPI, but nothing enforces it in plain JavaScript
    responses: options?.responses ?? { 200: { description: 'OK' } },
  };

  SchemaPathParamsResolver(openApiPath, metadata, schema);
  SchemaBodyResolver(metadata, schema, warn);
  SchemaQueryParamsResolver(metadata, schema, warn);
  SchemaQueryParamResolver(metadata, schema, warn);
  SchemaHeaderResolver(metadata, schema, warn);

  return schema as RouteConfig;
}
