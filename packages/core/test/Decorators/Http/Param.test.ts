import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';
import { initializeMetadata } from '../../../src';

describe('Param Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['param']).toBeDefined();
    expect(meta.__methods['param'].args[0].type).toBe('param');
    expect(meta.__methods['param'].args[0].data?.name).toBe('param');
  });
});
