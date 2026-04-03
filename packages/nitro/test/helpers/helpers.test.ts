import { afterEach, describe, expect, it } from 'vitest';
import { useVercubeApp } from '../../src/helpers/helpers';

describe('useVercubeApp', () => {
  afterEach(() => {
    globalThis.__vercubeApp__ = undefined;
  });

  it('should return undefined when app is not initialized', () => {
    globalThis.__vercubeApp__ = undefined;
    expect(useVercubeApp()).toBeUndefined();
  });

  it('should return the app when initialized', () => {
    const mockApp = { fetch: () => {} } as any;
    globalThis.__vercubeApp__ = mockApp;
    expect(useVercubeApp()).toBe(mockApp);
  });
});
