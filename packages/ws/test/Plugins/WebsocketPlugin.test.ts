import { createApp } from '@vercube/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { $WebsocketService, WebsocketPlugin } from '../../src';
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
});
