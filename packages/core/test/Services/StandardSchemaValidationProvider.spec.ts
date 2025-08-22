import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from '@vercube/di';
import { StandardSchemaValidationProvider } from '../../src/Services/Validation/StandardSchemaValidationProvider';
import { z } from 'zod';

describe('StandardSchemaValidationProvider', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(StandardSchemaValidationProvider);
  });

  it('should validate data', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const data = {
      name: 'John',
      age: 30,
    };

    const validationProvider = container.get(StandardSchemaValidationProvider);
    const result = await validationProvider.validate(schema, data);

    expect(result).toBeDefined();
    expect((result as any).errors).toBeUndefined();
  });
});
