import { describe, it, expect, vi, beforeEach } from 'vitest';
import { watch } from '../src/Build/Watch';
import { getWatchFunc } from '../src/Utils/Utils';
import consola from 'consola';

// Mock dependencies
vi.mock('../src/Utils/Utils', () => ({
  getWatchFunc: vi.fn(),
}));

vi.mock('consola', () => ({
  default: {
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe('Watch', () => {
  const mockWatchFunc = vi.fn();
  const mockHooks = {
    hook: vi.fn(),
    callHook: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWatchFunc).mockReturnValue(mockWatchFunc);
    vi.spyOn(console, 'clear').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should use default bundler (rolldown) when not specified', async () => {
    const mockApp = {
      config: {
        build: {},
      },
      hooks: mockHooks,
    };

    await watch(mockApp as any);
    expect(getWatchFunc).toHaveBeenCalledWith('rolldown');
    expect(mockWatchFunc).toHaveBeenCalledWith(mockApp);
  });

  it('should use specified bundler from config', async () => {
    const mockApp = {
      config: {
        build: {
          bundler: 'vite',
        },
      },
      hooks: mockHooks,
    };

    await watch(mockApp as any);
    expect(getWatchFunc).toHaveBeenCalledWith('vite');
  });

  it('should set up hook listeners', async () => {
    const mockApp = {
      config: {
        build: {},
      },
      hooks: mockHooks,
    };

    await watch(mockApp as any);

    expect(mockHooks.hook).toHaveBeenCalledWith(
      'bundler-watch:start',
      expect.any(Function),
    );
    expect(mockHooks.hook).toHaveBeenCalledWith(
      'bundler-watch:end',
      expect.any(Function),
    );
    expect(mockHooks.hook).toHaveBeenCalledWith(
      'bundler-watch:error',
      expect.any(Function),
    );
  });

  it('should handle watch start hook', async () => {
    const mockApp = {
      config: {
        build: {},
      },
      hooks: mockHooks,
    };

    await watch(mockApp as any);

    const startHookCall = mockHooks.hook.mock.calls.find(
      (call) => call[0] === 'bundler-watch:start',
    );
    if (!startHookCall) throw new Error('Start hook not found');
    const startHook = startHookCall[1];
    startHook();

    expect(console.clear).toHaveBeenCalled();
    expect(consola.info).toHaveBeenCalledWith({
      tag: 'build',
      message: 'Start building...',
    });
  });

  it('should handle watch end hook', async () => {
    const mockApp = {
      config: {
        build: {},
      },
      hooks: mockHooks,
    };

    await watch(mockApp as any);

    const startHookCall = mockHooks.hook.mock.calls.find(
      (call) => call[0] === 'bundler-watch:start',
    );
    const endHookCall = mockHooks.hook.mock.calls.find(
      (call) => call[0] === 'bundler-watch:end',
    );

    if (!startHookCall || !endHookCall) throw new Error('Hooks not found');
    const startHook = startHookCall[1];
    const endHook = endHookCall[1];

    startHook();
    endHook();

    expect(consola.success).toHaveBeenCalledWith({
      tag: 'build',
      message: expect.stringMatching(/Built in \d+ms/),
    });
    expect(mockHooks.callHook).toHaveBeenCalledWith('dev:reload');
  });

  it('should handle watch error hook', async () => {
    const mockApp = {
      config: {
        build: {},
      },
      hooks: mockHooks,
    };

    await watch(mockApp as any);

    const errorHookCall = mockHooks.hook.mock.calls.find(
      (call) => call[0] === 'bundler-watch:error',
    );
    if (!errorHookCall) throw new Error('Error hook not found');
    const errorHook = errorHookCall[1];
    const mockError = new Error('Watch error');
    errorHook(mockError);

    expect(console.log).toHaveBeenCalledWith(mockError);
  });
});
