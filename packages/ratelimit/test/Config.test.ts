import { defineConfig } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import '../src';
import type { ConfigTypes } from '@vercube/core';

describe('the rateLimit config section', () => {
  it('should be typed once the package is imported', () => {
    const config = defineConfig({ rateLimit: { limit: 100, window: '1m', trustProxy: 1, algorithm: 'sliding' } });
    const section: NonNullable<ConfigTypes.Config['rateLimit']> = { storage: 'redis' };

    // @ts-expect-error - not an algorithm
    defineConfig({ rateLimit: { algorithm: 'token-bucket' } });

    expect(config.rateLimit?.limit).toBe(100);
    expect(section.storage).toBe('redis');
  });
});
