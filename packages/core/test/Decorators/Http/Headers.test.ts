import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';
import { initializeMetadata } from '../../../src';

describe('Header Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['headers']).toBeDefined();
    expect(meta.__methods['headers'].args[0].type).toBe('headers');
  });
});
