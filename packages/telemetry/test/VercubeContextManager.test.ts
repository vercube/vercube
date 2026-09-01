import { createContextKey, ROOT_CONTEXT } from '@opentelemetry/api';
import { RequestContext } from '@vercube/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { VercubeContextManager } from '../src/Context/VercubeContextManager';

const KEY = createContextKey('test');

describe('VercubeContextManager', () => {
  let requestContext: RequestContext;
  let manager: VercubeContextManager;

  beforeEach(() => {
    requestContext = new RequestContext();
    manager = new VercubeContextManager(requestContext).enable();
  });

  it('returns the root context outside any frame', () => {
    expect(manager.active()).toBe(ROOT_CONTEXT);
  });

  it('activates a context for the duration of the call', () => {
    const context = ROOT_CONTEXT.setValue(KEY, 'a');

    const value = manager.with(context, () => manager.active().getValue(KEY));

    expect(value).toBe('a');
    expect(manager.active()).toBe(ROOT_CONTEXT);
  });

  it('passes a synchronous result through without a promise', () => {
    const result = manager.with(ROOT_CONTEXT, () => 'sync');

    expect(result).toBe('sync');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('nests', () => {
    const outer = ROOT_CONTEXT.setValue(KEY, 'outer');
    const inner = ROOT_CONTEXT.setValue(KEY, 'inner');

    manager.with(outer, () => {
      expect(manager.active().getValue(KEY)).toBe('outer');
      manager.with(inner, () => expect(manager.active().getValue(KEY)).toBe('inner'));
      expect(manager.active().getValue(KEY)).toBe('outer');
    });
  });

  it('keeps concurrent async branches isolated', async () => {
    const seen: string[] = [];

    const branch = async (value: string, delay: number): Promise<void> => {
      await manager.with(ROOT_CONTEXT.setValue(KEY, value), async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        seen.push(manager.active().getValue(KEY) as string);
      });
    };

    await Promise.all([branch('first', 20), branch('second', 0)]);

    expect(seen.sort()).toEqual(['first', 'second']);
  });

  it('shares one request context across nested telemetry frames', () => {
    requestContext.run(() => {
      manager.with(ROOT_CONTEXT.setValue(KEY, 'span'), () => {
        // Written from inside a span frame...
        requestContext.set('user', 'ada');
      });

      // ...and still readable after it, because nested frames point at the
      // frame the request started in rather than carrying their own map.
      expect(requestContext.get('user')).toBe('ada');
    });
  });

  it('sees the request context from inside a span frame', () => {
    requestContext.run(() => {
      requestContext.set('tenant', 'acme');

      manager.with(ROOT_CONTEXT, () => {
        expect(requestContext.get('tenant')).toBe('acme');
      });
    });
  });

  it('binds functions to a context', () => {
    const context = ROOT_CONTEXT.setValue(KEY, 'bound');
    const bound = manager.bind(context, () => manager.active().getValue(KEY));

    expect(bound()).toBe('bound');
  });

  it('leaves non-functions alone', () => {
    const target = { a: 1 };

    expect(manager.bind(ROOT_CONTEXT, target)).toBe(target);
  });

  it('falls back to the root context while disabled', () => {
    manager.disable();

    const value = manager.with(ROOT_CONTEXT.setValue(KEY, 'a'), () => manager.active().getValue(KEY));

    expect(value).toBeUndefined();
  });
});
