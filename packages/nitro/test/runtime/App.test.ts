import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercube/core', () => ({
  createApp: vi.fn().mockResolvedValue({
    container: { bind: vi.fn() },
  }),
}));

vi.mock('@vercube/di', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercube/di')>();
  return {
    ...actual,
    initializeContainer: vi.fn(),
  };
});

vi.mock('../src/runtime/Storage', () => ({
  NitroStorageManager: class NitroStorageManager {},
}));

import { createApp } from '@vercube/core';
import { initializeContainer } from '@vercube/di';
import { createNitroApp } from '../../src/runtime/App';

function makeNitroOpts(overrides: Record<string, any> = {}) {
  return {
    logLevel: 4,
    dev: false,
    runtimeConfig: {},
    ...overrides,
  } as any;
}

describe('createNitroApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call createApp with correct config', async () => {
    await createNitroApp(makeNitroOpts({ dev: true, logLevel: 3 }));
    expect(createApp).toHaveBeenCalledWith({
      cfg: expect.objectContaining({ dev: true, production: false }),
    });
  });

  it('should call initializeContainer', async () => {
    await createNitroApp(makeNitroOpts());
    expect(initializeContainer).toHaveBeenCalled();
  });

  it('should return the app', async () => {
    const result = await createNitroApp(makeNitroOpts());
    expect(result).toBeDefined();
    expect(result.container).toBeDefined();
  });

  it.each([
    [0, 'debug'],
    [1, 'error'],
    [2, 'warn'],
    [3, 'info'],
    [4, 'debug'],
    [undefined, 'debug'],
  ])('should map logLevel %s to %s', async (logLevel, expectedLevel) => {
    await createNitroApp(makeNitroOpts({ logLevel }));
    expect(createApp).toHaveBeenCalledWith({
      cfg: expect.objectContaining({ logLevel: expectedLevel }),
    });
  });
});
