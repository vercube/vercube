import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';
import { type App, initializeMetadata, Router } from '../../../src';

const methods: string[] = ['connect', 'get', 'post', 'put', 'delete', 'patch', 'trace', 'head'];

describe('Http Methods', () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe.each(methods)('Http Methods', (method) => {
    it(`should add ${method} to metadata`, () => {
      const router = app.container.get(Router);
      const meta = initializeMetadata(MockController.prototype);

      expect(meta.__methods[method]).toBeDefined();
      expect(meta.__methods[method].url).toBe(`/mock/${method}`);
      expect(meta.__methods[method].method).toBe(method.toUpperCase());
      expect(
        router.resolve({
          method: method.toUpperCase(),
          path: `/mock/${method}`,
        }),
      ).toBeDefined();
    });
  });
});
