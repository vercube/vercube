import { RequestContext } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { BearerTokenKey, RequestIdKey, RequestStartTimeKey } from '../src/Services/RequestContextKeys';
import { TypedRequestContext } from '../src/Services/TypedRequestContext';

describe('TypedRequestContext', () => {
  it('sets and gets typed keys inside a request context', async () => {
    const requestContext = new RequestContext();

    await requestContext.run(async () => {
      const ctx = new TypedRequestContext(requestContext);
      ctx.set(RequestIdKey, 'req-123');
      ctx.set(RequestStartTimeKey, 1_234_567_890);

      expect(ctx.get(RequestIdKey)).toBe('req-123');
      expect(ctx.get(RequestStartTimeKey)).toBe(1_234_567_890);
    });
  });

  it('throws when used outside a request context', () => {
    const requestContext = new RequestContext();
    const ctx = new TypedRequestContext(requestContext);

    expect(() => ctx.set(RequestIdKey, 'req-outside')).toThrow('RequestContext.set() called outside of request context');
    expect(() => ctx.get(RequestIdKey)).toThrow('RequestContext.get() called outside of request context');
  });

  it('isolates values between separate runs', async () => {
    const requestContext = new RequestContext();
    const ctx = new TypedRequestContext(requestContext);

    await requestContext.run(async () => {
      ctx.set(RequestIdKey, 'req-1');
      expect(ctx.get(RequestIdKey)).toBe('req-1');
    });

    await requestContext.run(async () => {
      expect(ctx.get(RequestIdKey)).toBeUndefined();
      ctx.set(RequestIdKey, 'req-2');
      expect(ctx.get(RequestIdKey)).toBe('req-2');
    });
  });

  it('preserves context through async chains', async () => {
    const requestContext = new RequestContext();

    await requestContext.run(async () => {
      const ctx = new TypedRequestContext(requestContext);
      ctx.set(RequestIdKey, 'req-async');

      const fromPromise = await Promise.resolve().then(() => ctx.get(RequestIdKey));
      const fromTimeout = await new Promise<string | undefined>((resolve) => {
        setTimeout(() => resolve(ctx.get(RequestIdKey)), 0);
      });

      expect(fromPromise).toBe('req-async');
      expect(fromTimeout).toBe('req-async');
    });
  });

  it('returns defensive copies from getAll and keys', async () => {
    const requestContext = new RequestContext();

    await requestContext.run(async () => {
      const ctx = new TypedRequestContext(requestContext);
      ctx.set(RequestIdKey, 'req-copy');

      const all = ctx.getAll();
      const keys = ctx.keys();

      all.set('requestId', 'mutated');
      keys.push('extraKey');

      expect(ctx.get(RequestIdKey)).toBe('req-copy');
      expect(ctx.keys()).toEqual(['requestId']);
    });
  });

  it('supports a middleware-to-handler flow', async () => {
    const requestContext = new RequestContext();
    const ctx = new TypedRequestContext(requestContext);

    const middleware = () => {
      ctx.set(RequestIdKey, 'req-flow');
      ctx.set(RequestStartTimeKey, 2137);
    };

    const handler = () => ({
      requestId: ctx.get(RequestIdKey),
      requestStartTime: ctx.get(RequestStartTimeKey),
    });

    await requestContext.run(async () => {
      middleware();
      const result = handler();
      expect(result).toEqual({ requestId: 'req-flow', requestStartTime: 2137 });
    });
  });

  it('keeps contexts isolated across parallel runs', async () => {
    const requestContext = new RequestContext();
    const ctx = new TypedRequestContext(requestContext);

    const runOne = requestContext.run(async () => {
      ctx.set(RequestIdKey, 'req-a');
      await Promise.resolve();
      return ctx.get(RequestIdKey);
    });

    const runTwo = requestContext.run(async () => {
      ctx.set(RequestIdKey, 'req-b');
      await Promise.resolve();
      return ctx.get(RequestIdKey);
    });

    const results = await Promise.all([runOne, runTwo]);
    expect(results.sort()).toEqual(['req-a', 'req-b']);
  });

  it('returns defaults when keys are missing', async () => {
    const requestContext = new RequestContext();

    await requestContext.run(async () => {
      const ctx = new TypedRequestContext(requestContext);
      expect(ctx.get(BearerTokenKey)).toBeUndefined();
      expect(ctx.getOrDefault(BearerTokenKey, 'none')).toBe('none');
    });
  });
});
