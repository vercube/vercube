import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDevServer, createVercube } from '../src';
import { resolve } from 'node:path';
import { fork } from 'node:child_process';
import consola from 'consola';

// Mock dependencies
vi.mock('node:child_process', () => ({
  fork: vi.fn(),
}));

vi.mock('consola', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DevServer', async () => {
  const mockApp = await createVercube();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should create a dev server instance', () => {
    const server = createDevServer(mockApp as any);
    expect(server).toBeDefined();
    expect(typeof server.reload).toBe('function');
  });

  it('should use correct fork entry path', async () => {
    const expectedPath = resolve(process.cwd(), 'dist', 'index.mjs');
    createDevServer(mockApp as any);

    mockApp.hooks.callHook('dev:reload');

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fork).toHaveBeenCalledWith(expectedPath);
  });

  it('should handle reload successfully', async () => {
    const server = createDevServer(mockApp as any);
    await server.reload();
    expect(consola.success).toHaveBeenCalledWith({
      tag: 'worker',
      message: 'Worker reloaded successfully',
    });
  });

  it('should handle reload errors', async () => {
    const mockError = new Error('Fork failed');
    vi.mocked(fork).mockImplementationOnce(() => {
      throw mockError;
    });

    const server = createDevServer(mockApp as any);
    await server.reload();
    expect(consola.error).toHaveBeenCalledWith({
      tag: 'worker',
      message: 'Failed to reload worker',
      error: mockError,
    });
  });
}); 