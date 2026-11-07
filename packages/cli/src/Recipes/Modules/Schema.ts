import { defineRecipe } from '../Apply';

/** A route documented in OpenAPI, its body validated by the same schema. */
const GREETING_CONTROLLER = `import { Body, Controller, Post } from '@vercube/core';
import { Schema, z } from '@vercube/schema';

interface Greeting {
  name: string;
}

const GreetingSchema: z.ZodType<Greeting> = z.object({ name: z.string().min(1) }).openapi('Greeting');

/**
 * Documented in the OpenAPI document at /_schema, with the reference at /_schema/docs.
 */
@Controller('/api/greetings')
export default class GreetingController {
  @Post('/')
  @Schema({ summary: 'Greet someone' })
  public async greet(@Body({ validationSchema: GreetingSchema }) body: Greeting): Promise<{ message: string }> {
    return { message: \`Hello, \${body.name}!\` };
  }
}
`;

export const schemaRecipe = defineRecipe({
  id: 'schema',
  label: 'Schema / OpenAPI',
  hint: 'validation and an OpenAPI document',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/schema': 'latest' });
    project.addPlugin({
      name: 'SchemaPlugin',
      from: '@vercube/schema',
      options: `{ document: { info: { title: 'API', version: '1.0.0' } } }`,
    });
    project.createFile('src/controller/GreetingController.ts', GREETING_CONTROLLER);
    project.bind({ name: 'GreetingController', from: '@/controller/GreetingController', default: true });
    project.note('OpenAPI reference at /_schema/docs');
  },
});
