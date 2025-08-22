import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Decorators
export * from './Decorators/Schema';

// Plugin
export * from './Plugins/SchemaPlugin';

// extends ZOD schema
extendZodWithOpenApi(z);

export { z };
