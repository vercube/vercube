import { describe, it, expect, vi, beforeEach } from 'vitest';
import { build } from '../src/Build/Build';
import { getBuildFunc } from '../src/Utils/Utils';

// Mock the Utils module
vi.mock('../src/Utils/Utils', () => ({
  getBuildFunc: vi.fn(),
}));

describe('Build', () => {
  const mockBuildFunc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBuildFunc).mockReturnValue(mockBuildFunc);
  });

  it('should use default bundler (rolldown) when not specified', async () => {
    const mockApp = {
      config: {
        build: {},
      },
      hooks: {
        hook: vi.fn(),
      },
    };

    await build(mockApp as any);
    expect(getBuildFunc).toHaveBeenCalledWith('rolldown');
  });

  it('should use specified bundler from config', async () => {
    const mockApp = {
      config: {
        build: {
          bundler: 'vite',
        },
      },
    };

    await build(mockApp as any);
    expect(getBuildFunc).toHaveBeenCalledWith('vite');
    expect(mockBuildFunc).toHaveBeenCalledWith({ bundler: 'vite' });
  });

  it('should pass build config to build function', async () => {
    const mockBuildConfig = {
      bundler: 'vite',
      output: {
        dir: 'dist',
      },
    };

    const mockApp = {
      config: {
        build: mockBuildConfig,
      },
    };

    await build(mockApp as any);
    expect(mockBuildFunc).toHaveBeenCalledWith(mockBuildConfig);
  });

  it('should handle build errors', async () => {
    const mockError = new Error('Build failed');
    mockBuildFunc.mockRejectedValueOnce(mockError);

    const mockApp = {
      config: {
        build: {},
      },
    };

    await expect(build(mockApp as any)).rejects.toThrow(mockError);
  });
}); 