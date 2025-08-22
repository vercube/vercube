import { beforeAll, describe, expect, it } from 'vitest';
import { initializeMetadata } from '../../../src';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';

describe('Header Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['header']).toBeDefined();
    expect(meta.__methods['header'].args[0].type).toBe('header');
    expect(meta.__methods['header'].args[0].data?.name).toBe('x-test');
  });
});
