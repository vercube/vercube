import { beforeEach, describe, expect, it } from 'vitest';
import { RequestContext } from '../../../src/Services/Router/RequestContext';

describe('RequestContext telemetry frames', () => {
  let context: RequestContext;

  beforeEach(() => {
    context = new RequestContext();
  });

  it('reports whether a frame is open', () => {
    expect(context.active).toBe(false);
    context.run(() => expect(context.active).toBe(true));
  });

  it('has no telemetry context outside a frame', () => {
    expect(context.getOtelContext()).toBeUndefined();
  });

  it('carries a telemetry context through a nested frame', () => {
    context.run(() => {
      context.runWithOtelContext('span-a', () => {
        expect(context.getOtelContext()).toBe('span-a');
      });

      expect(context.getOtelContext()).toBeUndefined();
    });
  });

  it('opens a frame of its own outside a request', () => {
    // Bootstrap spans are created before any request exists.
    context.runWithOtelContext('bootstrap', () => {
      expect(context.getOtelContext()).toBe('bootstrap');
      expect(context.active).toBe(true);
    });
  });

  it('keeps values written inside a nested frame visible after it', () => {
    context.run(() => {
      context.runWithOtelContext('span', () => context.set('user', 'ada'));

      expect(context.get('user')).toBe('ada');
      expect(context.keys()).toContain('user');
      expect(context.getAll().get('user')).toBe('ada');
      expect(context.has('user')).toBe(true);
    });
  });

  it('sees the request values from inside a nested frame', () => {
    context.run(() => {
      context.set('tenant', 'acme');

      context.runWithOtelContext('span', () => {
        expect(context.get('tenant')).toBe('acme');
        expect(context.getOrDefault('missing', 'fallback')).toBe('fallback');
      });
    });
  });

  it('passes a synchronous result through unchanged', () => {
    expect(context.runWithOtelContext('span', () => 'sync')).toBe('sync');
  });

  it('reports nothing stored outside a frame', () => {
    expect(context.has('user')).toBe(false);
    expect(context.keys()).toEqual([]);
    expect(context.getAll().size).toBe(0);
  });
});
