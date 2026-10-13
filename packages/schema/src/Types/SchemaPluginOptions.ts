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
   * @default '/_schema/'
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
   * Scalar API Reference UI served at `/_schema/docs`.
   * Pass `false` to disable.
   * @default enabled with OpenAPI at `/_schema/`
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
}
