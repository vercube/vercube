import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/Common/App';
import { createApp } from '../../src/Common/CreateApp';
import { defaultConfig } from '../../src/Config/DefaultConfig';
import { RuntimeConfig } from '../../src/Services/Config/RuntimeConfig';
import type { ConfigTypes } from '../../src/Types/ConfigTypes';

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
    const app = await createApp({ cfg: mockConfig });

    expect(app).toBeInstanceOf(App);
  });

  it('should set runtime config correctly', async () => {
    const app = await createApp({ cfg: mockConfig });
    const runtimeConfig = app.container.get(RuntimeConfig);

    expect(runtimeConfig.runtimeConfig).toEqual(mockConfig.runtime);
  });

  it('should initialize app with loaded config', async () => {
    const app = await createApp({ cfg: mockConfig });
    const runtimeConfig = app.container.get(RuntimeConfig);

    expect(runtimeConfig.runtimeConfig).toEqual(mockConfig.runtime);
  });

  it('should work without providing config', async () => {
    const app = await createApp();

    expect(app).toBeInstanceOf(App);
  });

  it('should work with setup function', async () => {
    let setupCalled = false;
    const setup = () => {
      setupCalled = true;
    };

    await createApp({ setup });

    expect(setupCalled).toBe(true);
  });
});
