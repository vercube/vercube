import { describe, expect, it, vi } from 'vitest';
import { loadVercubeConfig } from '../../src';

// A plain counter, not a `vi.fn()`: mocks are reset before every test, which
// would hide an import of c12 that happened when the loader itself was loaded.
const c12 = vi.hoisted(() => ({ imports: 0 }));

vi.mock('c12', () => {
  c12.imports++;

  return { loadConfig: async () => ({ config: {} }), setupDotenv: async () => {} };
});

describe('Config loader, lazy c12', () => {
  it('does not import c12 when configFile is false', async () => {
    const config = await loadVercubeConfig({ logLevel: 'debug' }, { configFile: false });

    expect(config.logLevel).toBe('debug');
    expect(c12.imports).toBe(0);
  });

  it('imports c12 when a config file is read', async () => {
    await loadVercubeConfig();

    expect(c12.imports).toBe(1);
  });
});
