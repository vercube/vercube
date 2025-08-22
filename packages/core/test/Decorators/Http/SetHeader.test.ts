import { beforeAll, describe, expect, it } from 'vitest';
import { initializeMetadata } from '../../../src';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';

describe('SetHeader Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['setHeader']).toBeDefined();
    expect(meta.__methods['setHeader'].actions[0].handler).toBeDefined();

    const response = meta.__methods['setHeader'].actions[0].handler(
      new Request('http://localhost/redirect'),
      new Response(),
    ) as Response;

    expect(response.headers.get('x-test')).toBe('test');
  });
});
