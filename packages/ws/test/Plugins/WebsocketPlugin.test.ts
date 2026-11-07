import { createApp } from '@vercube/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $WebsocketService, WebsocketPlugin, WebsocketService } from '../../src';
import type { App } from '@vercube/core';

describe('WebsocketPlugin', () => {
  let app: App;

  beforeEach(async () => {
    app = await createApp({
      setup: async (app) => {
        app.addPlugin(WebsocketPlugin);
      },
    });
  });

  it('should register plugin correctly', () => {
    const plugin = app.container.get($WebsocketService);
    expect(plugin).toBeDefined();
  });

  it('passes its options to the websocket service', async () => {
    const initialize = vi.spyOn(WebsocketService.prototype, 'initialize');
    const allowedOrigins = ['https://front.example'];

    await createApp({
      setup: async (app) => {
        app.addPlugin(WebsocketPlugin, { allowedOrigins });
      },
    });

    expect(initialize).toHaveBeenCalledWith({ allowedOrigins });
    initialize.mockRestore();
  });
});
