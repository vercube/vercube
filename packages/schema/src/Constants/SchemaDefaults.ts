import type { SchemaPluginOptions } from '../Types/SchemaPluginOptions';

/** Path the OpenAPI document is served at unless `path` is set. */
export const DEFAULT_SCHEMA_PATH = '/_schema';

/** Header that carries the access token. */
export const SCHEMA_TOKEN_HEADER = 'x-schema-token';

export const DEFAULT_SCHEMA_PLUGIN_OPTIONS: SchemaPluginOptions = {
  // `openApiUrl` is left out on purpose: it follows `path` unless set.
  scalar: {
    pageTitle: 'API Reference',
  },
};
