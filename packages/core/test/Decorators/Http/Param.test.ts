import { beforeAll, describe, expect, it } from 'vitest';
import { initializeMetadata } from '../../../src';
import { ValidationMiddleware } from '../../../src/Middleware/ValidationMiddleware';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';

describe('Param Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['param']).toBeDefined();
    expect(meta.__methods['param'].args[0].type).toBe('param');
    expect(meta.__methods['param'].args[0].data?.name).toBe('param');
    expect(meta.__methods['param'].args[0].validate).toBe(false);
    expect(meta.__methods['param'].args[0].validationSchema).toBeUndefined();
  });

  it(`should add param validation to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['paramValidation'].args[0].type).toBe('param');
    expect(meta.__methods['paramValidation'].args[0].data?.name).toBe('id');
    expect(meta.__methods['paramValidation'].args[0].validate).toBe(true);
    expect(meta.__methods['paramValidation'].args[0].validationSchema).toBeDefined();
  });

  it(`should register validation middleware only for a param with a schema`, () => {
    const meta = initializeMetadata(MockController.prototype);
    const targets = meta.__middlewares.filter((m) => m.middleware === ValidationMiddleware).map((m) => m.target);

    expect(targets).toContain('paramValidation');
    expect(targets).not.toContain('param');
  });
});
