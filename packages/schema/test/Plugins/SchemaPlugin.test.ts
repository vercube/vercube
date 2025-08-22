import { describe, it, expect, beforeEach } from 'vitest';
import { type App, createApp } from '@vercube/core';
import { SchemaPlugin } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';
import { SchemaController } from '../../src/Controllers/SchameController';

describe('SchemaPlugin', () => {
  let app: App;

  beforeEach(async () => {
    app = await createApp({
      setup: async (app) => {
        app.addPlugin(SchemaPlugin);
      },
    });
  });

  it('should register plugin correctly', () => {
    const plugin = app.container.get(SchemaRegistry);
    const controller = app.container.get(SchemaController);
    expect(plugin).toBeDefined();
    expect(controller).toBeDefined();
  });
});
