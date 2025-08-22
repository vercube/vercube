import { beforeAll, describe, expect, it } from 'vitest';
import { initializeMetadata } from '../../../src';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';

describe('Status Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['status']).toBeDefined();
    expect(meta.__methods['status'].actions[0].handler).toBeDefined();

    const response = meta.__methods['status'].actions[0].handler(
      new Request('http://localhost/status'),
      new Response(),
    ) as Response;

    expect(response.status).toBe(200);
  });
});
