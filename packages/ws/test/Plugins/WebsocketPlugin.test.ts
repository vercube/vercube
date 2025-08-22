import { describe, it, expect, beforeEach } from 'vitest';
import { type App, createApp } from '@vercube/core';
import { $WebsocketService, WebsocketPlugin } from '../../src';

describe('WebsocketPlugin', () => {
  let app: App;

  beforeEach(async () => {
    app = await createApp({
      setup: async (app) => {
        app.addPlugin(WebsocketPlugin);
      }
    });
  });

  it('should register plugin correctly', () => {
    const plugin = app.container.get($WebsocketService)
    expect(plugin).toBeDefined();
  });

});