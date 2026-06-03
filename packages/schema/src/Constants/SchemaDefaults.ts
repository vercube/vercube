import type { SchemaPluginOptions } from '../Types/SchemaPluginOptions';

export const DEFAULT_SCHEMA_PLUGIN_OPTIONS: SchemaPluginOptions = {
  scalar: {
    openApiUrl: '/_schema/',
    pageTitle: 'API Reference',
  },
};
