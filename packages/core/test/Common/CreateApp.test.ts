import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from '../../src/Common/CreateApp';
import { App } from '../../src/Common/App';
import { RuntimeConfig } from '../../src/Services/Config/RuntimeConfig';
import type { ConfigTypes } from '../../src/Types/ConfigTypes';
import { defaultConfig } from '../../src/Config/DefaultConfig';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('c12', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    config: {},
  }),
}));

describe('createApp', () => {
  
  let mockConfig: ConfigTypes.Config;

  beforeEach(() => {
    mockConfig = {
      ...defaultConfig,
      runtime: {
        session: {
          secret: 'test-secret',
          name: 'test-session',
          duration: 3600,
        },
      },
    };
  });

  it('should create and initialize an App instance', async () => {
    const app = await createApp(mockConfig);

    expect(app).toBeInstanceOf(App);
  });

  it('should set runtime config correctly', async () => {
    const app = await createApp(mockConfig);
    const runtimeConfig = app.container.get(RuntimeConfig);

    expect(runtimeConfig.runtimeConfig).toEqual(mockConfig.runtime);
  });

  it('should initialize app with loaded config', async () => {
    const app = await createApp(mockConfig);
    const runtimeConfig = app.container.get(RuntimeConfig);

    expect(runtimeConfig.runtimeConfig).toEqual(mockConfig.runtime);
  });

  it('should work without providing config', async () => {
    const app = await createApp();

    expect(app).toBeInstanceOf(App);
  });
}); 