import { describe, expect, it } from 'vitest';
import { defineConfig } from '../../src/Config/Config';

describe('Config', () => {
  it('should define config', () => {
    const config = defineConfig({
      logLevel: 'debug',
    });

    expect(config).toEqual({
      logLevel: 'debug',
    });
  });
});
