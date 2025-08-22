import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp } from '../../Utils/App.mock';
import { App, initializeMetadata } from '../../../src';
import {
  MiddlewareController,
  MiddlewareGlobalController,
  TestMiddleware,
} from '../../Utils/Middleware.mock';

describe('Middleware Decorator', () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe('Global Middleware', () => {
    beforeAll(async () => {
      app.container.bind(MiddlewareGlobalController);
    });

    it(`should add global middleware to metadata`, () => {
      const meta = initializeMetadata(MiddlewareGlobalController.prototype);

      expect(meta.__middlewares[0].target).toBe('__global__');
      expect(meta.__middlewares[0].priority).toBe(999);
      expect(meta.__middlewares[0].middleware).toBe(TestMiddleware);
    });
  });

  describe('Property Middleware', () => {
    beforeAll(async () => {
      app.container.bind(MiddlewareController);
    });

    it(`should add property middleware to metadata`, () => {
      const meta = initializeMetadata(MiddlewareController.prototype);

      expect(meta.__middlewares[0].target).toBe('middleware');
      expect(meta.__middlewares[0].priority).toBe(1);
      expect(meta.__middlewares[0].middleware).toBe(TestMiddleware);
    });
  });
});
