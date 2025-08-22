import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';
import { initializeMetadata } from '../../../src';

describe('Body Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['body']).toBeDefined();
    expect(meta.__methods['body'].args[0].type).toBe('body');
    expect(meta.__methods['body'].args[0].validate).toBe(false);
    expect(meta.__methods['body'].args[0].validationSchema).toBeUndefined();
  });

  it(`should add body validation to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['bodyValidation']).toBeDefined();
    expect(meta.__methods['bodyValidation'].args[0].type).toBe('body');
    expect(meta.__methods['bodyValidation'].args[0].validate).toBe(true);
    expect(meta.__methods['bodyValidation'].args[0].validationSchema).toBeDefined();
  });
});
