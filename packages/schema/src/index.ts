import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Decorators
export * from './Decorators/Schema';

// Plugin
export * from './Plugins/SchemaPlugin';

// Types
export type { SchemaPluginOptions, SchemaScalarOptions } from './Types/SchemaPluginOptions';

// extends ZOD schema
extendZodWithOpenApi(z);

export { z };
