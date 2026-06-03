import type { HtmlRenderingConfiguration } from '@scalar/client-side-rendering';

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
}
