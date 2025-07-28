import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Decorators
export * from './Decorators/Schema';

// Plugin
export * from './Plugins/SchemaPlugin';

// Schemas
export * from './Schemas/BaseHttpErrorSchema';
export * from './Schemas/ValidationErrorSchema';

// extends ZOD schema
extendZodWithOpenApi(z);

export { z };