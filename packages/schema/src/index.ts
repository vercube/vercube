import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Decorators
export * from './Decorators/Schema';

// Plugin
export * from './Plugins/SchemaPlugin';

// extends ZOD schema
extendZodWithOpenApi(z);

export { z };