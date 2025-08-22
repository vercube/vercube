import { describe, it, expect } from 'vitest';
import { createMetadataCtx, createMetadataMethod, initializeMetadataMethod, initializeMetadata } from '../../src/Utils/Utils';

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
      expect(target.__metadata.__methods.testMethod).toBeDefined();
      expect(target.__metadata.__methods.testMethod).toEqual({
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
      expect(target.__metadata.__methods.testMethod).toBe(existingMethod);
    });
  });

  describe('initializeMetadata', () => {
    it('should initialize metadata when it does not exist', () => {
      const target = {};

      const result = initializeMetadata(target);

      expect(result).toBeDefined();
      expect(target.__metadata).toBeDefined();
      expect(target.__metadata.__controller).toEqual({ path: '' });
      expect(target.__metadata.__middlewares).toEqual([]);
      expect(target.__metadata.__methods).toEqual({});
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
      expect(target.__metadata.__methods).toEqual({});
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
      expect(target.__metadata.__middlewares).toEqual([]);
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
      expect(target.__metadata).toBe(existingMetadata);
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

      expect(result.__methods).toBe(existingMethods);
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

      expect(result.__middlewares).toBe(existingMiddlewares);
    });
  });
});
