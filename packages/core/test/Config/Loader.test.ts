import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigTypes } from '../../src/Types/ConfigTypes';
import { loadVercubeConfig } from '../../src';

vi.mock('c12', () => {
  const mockLoadConfig = vi.fn();
  const mockSetupDotenv = vi.fn();

  return {
    loadConfig: mockLoadConfig,
    setupDotenv: mockSetupDotenv,
  };
});

describe('Config loader', () => {
  let mockLoadConfig: ReturnType<typeof vi.fn>;
  let mockSetupDotenv: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const c12 = await import('c12');
    mockLoadConfig = vi.mocked(c12.loadConfig);
    mockSetupDotenv = vi.mocked(c12.setupDotenv);
  });

  it('should load config with overrides', async () => {
    const overrides: ConfigTypes.Config = {
      logLevel: 'debug',
      c12: {
        dotenv: {
          cwd: process.cwd(),
        },
      },
    };

    mockLoadConfig.mockResolvedValue({
      config: {
        logLevel: 'info',
        server: {
          port: 3000,
        },
      },
    });

    const config = await loadVercubeConfig(overrides);

    expect(mockLoadConfig).toHaveBeenCalledWith({
      name: 'vercube',
      dotenv: overrides.c12?.dotenv,
      rcFile: false,
      globalRc: false,
      defaults: expect.any(Object),
    });
    // defu merges loaded config with overrides, with overrides taking precedence
    expect(config).toEqual({
      logLevel: 'debug', // From overrides
      c12: {
        dotenv: {
          cwd: process.cwd(),
        },
      }, // From overrides
      server: {
        port: 3000,
      }, // From loaded config
    });
  });

  it('should load config without overrides', async () => {
    mockLoadConfig.mockResolvedValue({
      config: {
        logLevel: 'info',
        server: {
          port: 3000,
        },
      },
    });

    const config = await loadVercubeConfig();

    expect(mockLoadConfig).toHaveBeenCalledWith({
      name: 'vercube',
      dotenv: true, // Should use default true when no overrides
      rcFile: false,
      globalRc: false,
      defaults: expect.any(Object),
    });
    expect(config).toEqual({
      logLevel: 'info',
      server: {
        port: 3000,
      },
    });
  });

  it('should load config with overrides but no c12 dotenv', async () => {
    const overrides: ConfigTypes.Config = {
      logLevel: 'debug',
      // No c12.dotenv specified
    };

    mockLoadConfig.mockResolvedValue({
      config: {
        logLevel: 'info',
        server: {
          port: 3000,
        },
      },
    });

    const config = await loadVercubeConfig(overrides);

    expect(mockLoadConfig).toHaveBeenCalledWith({
      name: 'vercube',
      dotenv: true, // Should use default true when overrides.c12?.dotenv is undefined
      rcFile: false,
      globalRc: false,
      defaults: expect.any(Object),
    });
    // defu merges loaded config with overrides, with overrides taking precedence
    expect(config).toEqual({
      logLevel: 'debug', // From overrides
      server: {
        port: 3000,
      }, // From loaded config
    });
  });

  it('should call setupDotenv when config has c12.dotenv object', async () => {
    const overrides: ConfigTypes.Config = {
      logLevel: 'debug',
      c12: {
        dotenv: {
          cwd: process.cwd(),
        },
      },
    };

    const dotenvConfig = { cwd: '/custom/path' };
    mockLoadConfig.mockResolvedValue({
      config: {
        logLevel: 'info',
        c12: {
          dotenv: dotenvConfig,
        },
      },
    });

    const config = await loadVercubeConfig(overrides);

    expect(mockSetupDotenv).toHaveBeenCalledWith(dotenvConfig);
    expect(config).toEqual(overrides);
  });

  it('should not call setupDotenv when config has c12.dotenv but it is not an object', async () => {
    const overrides: ConfigTypes.Config = {
      logLevel: 'debug',
    };

    mockLoadConfig.mockResolvedValue({
      config: {
        logLevel: 'info',
        c12: {
          dotenv: true, // Not an object
        },
      },
    });

    const config = await loadVercubeConfig(overrides);

    expect(mockSetupDotenv).not.toHaveBeenCalled();
    // defu merges loaded config with overrides, with overrides taking precedence
    expect(config).toEqual({
      logLevel: 'debug', // From overrides
      c12: {
        dotenv: true, // From loaded config
      },
    });
  });

  it('should not call setupDotenv when config has no c12.dotenv', async () => {
    const overrides: ConfigTypes.Config = {
      logLevel: 'debug',
    };

    mockLoadConfig.mockResolvedValue({
      config: {
        logLevel: 'info',
        // No c12.dotenv
      },
    });

    const config = await loadVercubeConfig(overrides);

    expect(mockSetupDotenv).not.toHaveBeenCalled();
    expect(config).toEqual(overrides);
  });

  it('should not call setupDotenv when config is null', async () => {
    const overrides: ConfigTypes.Config = {
      logLevel: 'debug',
    };

    mockLoadConfig.mockResolvedValue(null);

    const config = await loadVercubeConfig(overrides);

    expect(mockSetupDotenv).not.toHaveBeenCalled();
    expect(config).toEqual(overrides);
  });

  it('should merge config when both overrides and loaded config exist', async () => {
    const overrides: ConfigTypes.Config = {
      logLevel: 'debug',
      server: {
        port: 8080,
      },
    };

    mockLoadConfig.mockResolvedValue({
      config: {
        logLevel: 'info',
        server: {
          port: 3000,
          host: 'localhost',
        },
        runtime: {
          env: 'production',
        },
      },
    });

    const config = await loadVercubeConfig(overrides);

    // Should merge with overrides taking precedence
    expect(config).toEqual({
      logLevel: 'debug', // From overrides
      server: {
        port: 8080, // From overrides
        host: 'localhost', // From loaded config
      },
      runtime: {
        env: 'production', // From loaded config
      },
    });
  });

  it('should handle empty config object', async () => {
    mockLoadConfig.mockResolvedValue({
      config: {},
    });

    const config = await loadVercubeConfig();

    expect(config).toEqual({});
  });

  it('should handle null config object', async () => {
    mockLoadConfig.mockResolvedValue({
      config: null,
    });

    const config = await loadVercubeConfig();

    expect(config).toEqual({});
  });
});
