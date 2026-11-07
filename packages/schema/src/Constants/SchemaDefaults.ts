import type { SchemaPluginOptions } from '../Types/SchemaPluginOptions';

/** Path the OpenAPI document is served at unless `path` is set. */
export const DEFAULT_SCHEMA_PATH = '/_schema';

/** Header that carries the access token. */
export const SCHEMA_TOKEN_HEADER = 'x-schema-token';

/** Version of `@scalar/api-reference` the docs page loads, kept in step with `@scalar/client-side-rendering`. */
export const SCALAR_VERSION = '1.77.0';

/** Pinned Scalar bundle the docs page loads unless `scalar.cdn` is set. */
export const DEFAULT_SCALAR_CDN = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js`;

/** Subresource integrity of {@link DEFAULT_SCALAR_CDN}. Update it together with {@link SCALAR_VERSION}. */
export const SCALAR_INTEGRITY = 'sha384-+7ESN8b9Ljg46TCYKedZUlhF/wfZbOt78aV/DtoU3anEElh8Q2eXsyhQ9W5lAZD4';

export const DEFAULT_SCHEMA_PLUGIN_OPTIONS: SchemaPluginOptions = {
  // `openApiUrl` is left out on purpose: it follows `path` unless set.
  scalar: {
    pageTitle: 'API Reference',
  },
};
