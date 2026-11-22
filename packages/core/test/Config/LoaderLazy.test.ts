import { describe, expect, it, vi } from 'vitest';
import { loadVercubeConfig } from '../../src';

const c12Factory = vi.hoisted(() => vi.fn(() => ({ loadConfig: vi.fn(async () => ({ config: {} })), setupDotenv: vi.fn() })));

vi.mock('c12', c12Factory);

describe('Config loader, lazy c12', () => {
  it('does not import c12 when configFile is false', async () => {
    const config = await loadVercubeConfig({ logLevel: 'debug' }, { configFile: false });

    expect(config.logLevel).toBe('debug');
    expect(c12Factory).not.toHaveBeenCalled();
  });

  it('imports c12 when a config file is read', async () => {
    await loadVercubeConfig();

    expect(c12Factory).toHaveBeenCalledTimes(1);
  });
});
