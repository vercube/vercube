import { beforeAll, describe, expect, it } from 'vitest';
import { App, createApp, initializeMetadata, Middleware } from '../../../src';
import { createTestApp } from '../../Utils/App.mock';
import {
  ArgsMiddleware,
  MiddlewareArgsController,
  MiddlewareArgsGlobalController,
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

  describe('Middleware Args', () => {
    it(`should add global middleware args to metadata`, () => {
      const meta = initializeMetadata(MiddlewareArgsGlobalController.prototype);

      expect(meta.__middlewares[0].target).toBe('__global__');
      expect(meta.__middlewares[0].middleware).toBe(ArgsMiddleware);
      expect(meta.__middlewares[0].args).toEqual({ roles: ['user'] });
    });

    it(`should add property middleware args to metadata`, () => {
      const meta = initializeMetadata(MiddlewareArgsController.prototype);
      const middleware = meta.__middlewares.find((m) => m.target === 'middleware');

      expect(middleware?.priority).toBe(1);
      expect(middleware?.args).toEqual({ roles: ['admin'] });
    });

    it(`should pass args to the middleware as middlewareArgs`, async () => {
      const argsApp = await createApp({
        cfg: { requestLogging: false },
        setup: (instance) => {
          instance.container.bind(MiddlewareArgsGlobalController);
          instance.container.bind(MiddlewareArgsController);
        },
      });

      const fetchArgs = async (path: string) => (await argsApp.fetch(new Request(`http://localhost${path}`))).json();

      expect(await fetchArgs('/middleware-args-global')).toEqual({ middlewareArgs: { roles: ['user'] } });
      expect(await fetchArgs('/middleware-args')).toEqual({ middlewareArgs: { roles: ['admin'] } });
      expect(await fetchArgs('/middleware-args/none')).toEqual({ middlewareArgs: null });
    });
  });

  it(`should type args after the middleware`, () => {
    Middleware(ArgsMiddleware, { args: { roles: ['admin'] } });

    // @ts-expect-error - roles has to be a string array
    Middleware(ArgsMiddleware, { args: { roles: 'admin' } });
  });
});
