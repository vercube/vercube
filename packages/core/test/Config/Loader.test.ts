import { describe, expect, it, vi } from 'vitest';
import { loadVercubeConfig } from '../../src/Config/Loader';

vi.mock('c12', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    config: {},
  }),
}));

describe('Config loader', () => {

  it('should load config', async () => {
    const config = await loadVercubeConfig({
      logLevel: 'debug',
    });

    expect(config).toEqual({
      logLevel: 'debug',
    });
  });

});
