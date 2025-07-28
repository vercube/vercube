import { z,  } from 'zod';
import { BaseHttpErrorSchema } from './BaseHttpErrorSchema';

export const ValidationErrorSchema = z.object({
  ...BaseHttpErrorSchema,
  errors: z.array(z.any()).optional().openapi({
    description: 'The errors of the validation',
  }),
}).openapi('ValidationError');