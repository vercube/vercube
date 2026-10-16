import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

/** A security requirement: scheme names and their scopes. */
export type SecurityRequirement = Record<string, string[]>;

/**
 * What the registry knows about a route beyond its own metadata.
 */
export interface RouteContext {
  /** Name of the controller class. */
  controller: string;
  /** Name of the handler method. */
  propertyName: string;
  /** Whether an authentication middleware guards the route. */
  secured: boolean;
  /** Requirement documented for a guarded route, empty when there is none to use. */
  security: SecurityRequirement[];
  /** Whether the document declares a top-level security requirement. */
  globalSecurity: boolean;
}

/** Descriptions of the statuses a route usually answers with. */
const STATUS_DESCRIPTIONS: Readonly<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
};

/**
 * Fills in what `@Schema` leaves out from what the framework already knows
 * about the route:
 *
 * - `operationId` as `Controller_method`, and the controller name as its tag
 * - `responses` from `@Status`, `@Redirect`, `@SetHeader` and `@Sse`
 * - `security` from an authentication middleware such as `@Auth()`, and `[]`
 *   for a public route when the document requires security globally
 *
 * Anything `@Schema` states explicitly is kept as it is.
 *
 * @param metadata - The metadata of the method.
 * @param options - Options passed to `@Schema`.
 * @param schema - The route schema being built.
 * @param context - What the registry knows about the route.
 * @returns void
 */
export function SchemaDefaultsResolver(
  metadata: MetadataTypes.Method,
  options: Partial<RouteConfig>,
  schema: DeepPartial<RouteConfig>,
  context: RouteContext,
): void {
  schema.operationId = options.operationId ?? `${context.controller}_${context.propertyName}`;
  schema.tags = (options.tags ?? [context.controller]) as string[];

  if (!options.responses) {
    schema.responses = defaultResponses(metadata) as DeepPartial<RouteConfig['responses']>;
  }

  if (options.security === undefined) {
    if (context.secured && context.security.length > 0) {
      schema.security = context.security;
    } else if (!context.secured && context.globalSecurity) {
      // a public route under a global requirement has to say it needs none
      schema.security = [];
    }
  }
}

/**
 * Builds the response a route answers with from its declarative metadata.
 *
 * @param metadata - The metadata of the method.
 * @returns The responses object, with one entry.
 */
function defaultResponses(metadata: MetadataTypes.Method): RouteConfig['responses'] {
  const meta = metadata.meta ?? {};
  const redirect = meta.redirect as { location: string; code: number } | undefined;
  const status = redirect?.code ?? (meta.status as number | undefined) ?? 200;
  const headers: Record<string, { schema: { type: 'string'; example: string } }> = {};

  for (const [name, value] of Object.entries((meta.headers as Record<string, string> | undefined) ?? {})) {
    headers[name] = { schema: { type: 'string', example: value } };
  }

  if (redirect) {
    headers.Location = { schema: { type: 'string', example: redirect.location } };
  }

  return {
    [status]: {
      description: STATUS_DESCRIPTIONS[status] ?? 'Response',
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(meta.sse ? { content: { 'text/event-stream': { schema: { type: 'string' } } } } : {}),
    },
  } as RouteConfig['responses'];
}
