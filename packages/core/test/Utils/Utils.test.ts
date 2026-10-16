import { describe, expect, it } from 'vitest';
import {
  createMetadataCtx,
  createMetadataMethod,
  initializeMetadata,
  initializeMetadataMethod,
  setMetadataAction,
} from '../../src/Utils/Utils';

describe('Utils', () => {
  describe('createMetadataCtx', () => {
    it('should create a new metadata context', () => {
      const result = createMetadataCtx();

      expect(result).toEqual({
        __controller: {
          path: '',
        },
        __middlewares: [],
        __methods: {},
      });
    });
  });

  describe('createMetadataMethod', () => {
    it('should create a new metadata method', () => {
      const result = createMetadataMethod();

      expect(result).toEqual({
        req: null,
        res: null,
        url: null,
        method: null,
        args: [],
        actions: [],
        meta: {},
      });
    });
  });

  describe('initializeMetadataMethod', () => {
    it('should initialize metadata method when it does not exist', () => {
      const target = {
        __metadata: {
          __methods: {},
        },
      };

      const result = initializeMetadataMethod(target, 'testMethod');

      expect(result).toBeDefined();
      expect((target.__metadata as any).__methods.testMethod).toBeDefined();
      expect((target.__metadata as any).__methods.testMethod).toEqual({
        req: null,
        res: null,
        url: null,
        method: null,
        args: [],
        actions: [],
        meta: {},
      });
    });

    it('should return existing metadata method when it already exists', () => {
      const existingMethod = {
        req: null,
        res: null,
        url: '/test',
        method: 'GET',
        args: [],
        actions: [],
        meta: {},
      };

      const target = {
        __metadata: {
          __methods: {
            testMethod: existingMethod,
          },
        },
      };

      const result = initializeMetadataMethod(target, 'testMethod');

      expect(result).toBe(existingMethod);
      expect((target.__metadata as any).__methods.testMethod).toBe(existingMethod);
    });
  });

  describe('initializeMetadata', () => {
    it('should initialize metadata when it does not exist', () => {
      const target = {};

      const result = initializeMetadata(target);

      expect(result).toBeDefined();
      expect((target as any).__metadata).toBeDefined();
      expect((target as any).__metadata.__controller).toEqual({ path: '' });
      expect((target as any).__metadata.__middlewares).toEqual([]);
      expect((target as any).__metadata.__methods).toEqual({});
    });

    it('should initialize methods when they do not exist', () => {
      const target = {
        __metadata: {
          __controller: { path: '/test' },
          __middlewares: [],
        },
      };

      const result = initializeMetadata(target);

      expect(result).toBeDefined();
      expect((target as any).__metadata.__methods).toEqual({});
    });

    it('should initialize middlewares when they do not exist', () => {
      const target = {
        __metadata: {
          __controller: { path: '/test' },
          __methods: {},
        },
      };

      const result = initializeMetadata(target);

      expect(result).toBeDefined();
      expect((target as any).__metadata.__middlewares).toEqual([]);
    });

    it('should return existing metadata when it already exists', () => {
      const existingMetadata = {
        __controller: { path: '/existing' },
        __middlewares: [{ middleware: 'test' }],
        __methods: { testMethod: {} },
      };

      const target = {
        __metadata: existingMetadata,
      };

      const result = initializeMetadata(target);

      expect(result).toBe(existingMetadata);
      expect((target as any).__metadata).toBe(existingMetadata);
    });

    it('should preserve existing methods when initializing', () => {
      const existingMethods = { existingMethod: {} };
      const target = {
        __metadata: {
          __controller: { path: '/test' },
          __middlewares: [],
          __methods: existingMethods,
        },
      };

      const result = initializeMetadata(target);

      expect((result as any).__methods).toBe(existingMethods);
    });

    it('should preserve existing middlewares when initializing', () => {
      const existingMiddlewares = [{ middleware: 'existing' }];
      const target = {
        __metadata: {
          __controller: { path: '/test' },
          __methods: {},
          __middlewares: existingMiddlewares,
        },
      };

      const result = initializeMetadata(target);

      expect((result as any).__middlewares).toBe(existingMiddlewares);
    });
  });

  describe('inherited metadata', () => {
    it('should give a subclass its own copy of the parent metadata', () => {
      class Parent {}
      class Child extends Parent {}

      const parent = initializeMetadata(Parent.prototype);
      const method = initializeMetadataMethod(Parent.prototype, 'list');
      method.url = '/list';
      method.args.push({ idx: 0, type: 'body' });
      (parent as unknown as Record<string, unknown>).__flag = true;

      const child = initializeMetadata(Child.prototype);
      initializeMetadataMethod(Child.prototype, 'list').args.push({ idx: 1, type: 'request' });
      initializeMetadataMethod(Child.prototype, 'own');
      child.__controller.path = '/child';

      expect(child).not.toBe(parent);
      expect(child.__methods.list.url).toBe('/list');
      expect((child as unknown as Record<string, unknown>).__flag).toBe(true);
      expect(parent.__methods.list.args).toHaveLength(1);
      expect(parent.__methods.own).toBeUndefined();
      expect(parent.__controller.path).toBe('');
    });

    it('should copy a parent context without methods', () => {
      class Parent {}
      class Child extends Parent {}
      (Parent.prototype as unknown as Record<string, unknown>).__metadata = { __controller: { path: '/p' } };

      expect(initializeMetadata(Child.prototype).__methods).toEqual({});
    });
  });

  describe('setMetadataAction', () => {
    it('should replace an action of the same key and append the rest', () => {
      const method = createMetadataMethod();
      const key = {};

      setMetadataAction(method, { key, handler: () => ({ status: 201 }) });
      setMetadataAction(method, { key, handler: () => ({ status: 202 }) });
      setMetadataAction(method, { handler: () => undefined });
      setMetadataAction(method, { handler: () => undefined });

      expect(method.actions).toHaveLength(3);
      expect(method.actions[0].handler(new Request('http://localhost'), new Response())).toEqual({ status: 202 });
    });
  });
});
