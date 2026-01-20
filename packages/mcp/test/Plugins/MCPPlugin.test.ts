import { createApp } from '@vercube/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { MCPPlugin } from '../../src';
import { MCPController } from '../../src/Controllers/MCPController';
import { MCPHttpHandler } from '../../src/Services/MCPHttpHandler';
import { ToolRegistry } from '../../src/Services/ToolRegistry';
import type { App } from '@vercube/core';

describe('MCPPlugin', () => {
  let app: App;

  beforeEach(async () => {
    app = await createApp({
      setup: async (app) => {
        app.addPlugin(MCPPlugin);
      },
    });
  });

  it('registers MCP services and controller', () => {
    const registry = app.container.get(ToolRegistry);
    const handler = app.container.get(MCPHttpHandler);
    const controller = app.container.get(MCPController);

    expect(registry).toBeDefined();
    expect(handler).toBeDefined();
    expect(controller).toBeDefined();
  });
});
