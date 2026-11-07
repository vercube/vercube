import type { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { HtmlRenderingConfiguration } from '@scalar/client-side-rendering';

type OpenAPIDocument = ReturnType<OpenApiGeneratorV3['generateDocument']>;

/**
 * Top-level fields of the generated OpenAPI document. `paths` come from the
 * routes, `components` from {@link SchemaPluginOptions.components}.
 */
export type SchemaDocumentOptions = Partial<Omit<OpenAPIDocument, 'openapi' | 'paths' | 'components' | 'info'>> & {
  info?: Partial<OpenAPIDocument['info']>;
};

/**
 * Reusable OpenAPI components, e.g. `securitySchemes`, keyed by type and name.
 */
export type SchemaComponentsOptions = NonNullable<OpenAPIDocument['components']>;

/**
 * Scalar API Reference options (see https://github.com/scalar/scalar).
 */
export interface SchemaScalarOptions {
  /**
   * OpenAPI document URL passed to Scalar.
   * @default `${path}/`, so '/_schema/'
   */
  openApiUrl?: string;

  /** HTML page title. @default 'API Reference' */
  pageTitle?: string;

  /** CDN URL for the Scalar bundle. Uses Scalar default when omitted. */
  cdn?: string;

  /** Additional Scalar configuration (theme, layout, etc.). */
  config?: Partial<HtmlRenderingConfiguration>;
}

/**
 * Options for {@link SchemaPlugin}.
 */
export interface SchemaPluginOptions {
  /**
   * Serve the OpenAPI document and the Scalar UI over HTTP. The document is
   * still generated and published to introspection when this is off.
   * @default true, except when the application runs with `production: true`
   */
  enabled?: boolean;

  /**
   * Path the OpenAPI document is served at. The Scalar UI is served at `<path>/docs`.
   * @default '/_schema'
   */
  path?: string;

  /**
   * Access token required by both endpoints. Sent as the `x-schema-token`
   * header, or as `?token=` on the Scalar page, which then embeds the document
   * so the browser never has to fetch it separately.
   */
  token?: string;

  /**
   * Scalar API Reference UI served at `<path>/docs`.
   * Pass `false` to disable.
   * @default enabled with OpenAPI at `<path>/`
   */
  scalar?: false | SchemaScalarOptions;

  /**
   * Top-level fields of the OpenAPI document: `info`, `servers`, `security`,
   * `tags`, `externalDocs`. Missing `info` fields fall back to `API` / `1.0.0`.
   *
   * @example
   * ```ts
   * document: {
   *   info: { title: 'Community API', version: '2.3.0' },
   *   servers: [{ url: 'https://api.example.com/v1' }],
   *   security: [{ bearerAuth: [] }],
   * }
   * ```
   */
  document?: SchemaDocumentOptions;

  /**
   * Components added to the document, e.g. security schemes referenced from
   * `document.security` or `@Schema({ security })`.
   *
   * @example
   * ```ts
   * components: {
   *   securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
   * }
   * ```
   */
  components?: SchemaComponentsOptions;

  /**
   * Document every routed method, not only those with `@Schema`. Methods without
   * it get the defaults derived from the route: path, parameters, body,
   * responses, `operationId`, tags and security.
   * @default false
   */
  includeAllRoutes?: boolean;

  /**
   * Security requirement documented for routes guarded by `@Auth()`. Defaults to
   * `document.security`, else to any one of the `components.securitySchemes`.
   *
   * @example
   * ```ts
   * security: [{ bearerAuth: [] }]
   * ```
   */
  security?: Record<string, string[]>[];
}

/**
 * {@link SchemaPluginOptions} after the plugin resolved its defaults.
 * @internal
 */
export type SchemaResolvedOptions = SchemaPluginOptions & {
  enabled: boolean;
  path: string;
};
