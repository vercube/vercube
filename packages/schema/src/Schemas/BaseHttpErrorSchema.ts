import { z } from 'zod';

export const BaseHttpErrorSchema: z.ZodType = z.object({
  status: z.number().openapi({
    description: 'The HTTP status code of the error',
  }),
  name: z.string().optional().openapi({
    description: 'The name of the error',
  }),
  message: z.string().openapi({
    description: 'The message of the error',
  }),
}).openapi('HttpError');