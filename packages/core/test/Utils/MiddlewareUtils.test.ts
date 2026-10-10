import { describe, expect, it } from 'vitest';
import { BaseMiddleware } from '../../src/Services/Middleware/BaseMiddleware';
import { isSameMiddleware } from '../../src/Utils/MiddlewareUtils';
import { addMetadataMiddleware, createMetadataCtx } from '../../src/Utils/Utils';
import type { MetadataTypes } from '../../src/Types/MetadataTypes';

class FirstMiddleware extends BaseMiddleware {}
class SecondMiddleware extends BaseMiddleware {}
class Provider {}
class OtherProvider {}

const entry = (middleware: typeof BaseMiddleware, args?: unknown): MetadataTypes.Middleware => ({
  target: '__global__',
  middleware,
  args,
});

describe('MiddlewareUtils', () => {
  describe('isSameMiddleware', () => {
    it('should not match different middleware classes', () => {
      expect(isSameMiddleware(entry(FirstMiddleware), entry(SecondMiddleware))).toBe(false);
    });

    it('should match the same class without args', () => {
      expect(isSameMiddleware(entry(FirstMiddleware), entry(FirstMiddleware))).toBe(true);
    });

    it('should treat missing args and an empty object as the same', () => {
      expect(isSameMiddleware(entry(FirstMiddleware), entry(FirstMiddleware, {}))).toBe(true);
      expect(isSameMiddleware(entry(FirstMiddleware, null), entry(FirstMiddleware, {}))).toBe(true);
    });

    it('should match structurally equal args', () => {
      expect(
        isSameMiddleware(
          entry(FirstMiddleware, { roles: ['admin'], provider: Provider }),
          entry(FirstMiddleware, { provider: Provider, roles: ['admin'] }),
        ),
      ).toBe(true);
    });

    it('should not match different args', () => {
      expect(isSameMiddleware(entry(FirstMiddleware, { roles: [] }), entry(FirstMiddleware, { roles: ['admin'] }))).toBe(false);
      expect(isSameMiddleware(entry(FirstMiddleware), entry(FirstMiddleware, { roles: ['admin'] }))).toBe(false);
      expect(isSameMiddleware(entry(FirstMiddleware, { roles: ['a', 'b'] }), entry(FirstMiddleware, { roles: ['b', 'a'] }))).toBe(
        false,
      );
    });

    it('should compare classes and functions in args by identity', () => {
      expect(
        isSameMiddleware(entry(FirstMiddleware, { provider: Provider }), entry(FirstMiddleware, { provider: OtherProvider })),
      ).toBe(false);
    });
  });

  describe('addMetadataMiddleware', () => {
    it('should skip the same middleware with the same args on the same target', () => {
      const meta = createMetadataCtx();

      addMetadataMiddleware(meta, { target: 'method', middleware: FirstMiddleware, args: {} });
      addMetadataMiddleware(meta, { target: 'method', middleware: FirstMiddleware, args: {} });

      expect(meta.__middlewares).toHaveLength(1);
    });

    it('should keep the same middleware with different args on the same target', () => {
      const meta = createMetadataCtx();

      addMetadataMiddleware(meta, { target: 'method', middleware: FirstMiddleware, args: { roles: ['user'] } });
      addMetadataMiddleware(meta, { target: 'method', middleware: FirstMiddleware, args: { roles: ['admin'] } });

      expect(meta.__middlewares.map((m) => m.args)).toEqual([{ roles: ['user'] }, { roles: ['admin'] }]);
    });
  });
});
