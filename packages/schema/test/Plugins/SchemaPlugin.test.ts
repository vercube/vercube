import { beforeEach, describe, expect, it } from 'vitest';
import { type App, createApp } from '@vercube/core';
import { SchemaPlugin } from '../../src';
import { SchemaController } from '../../src/Controllers/SchameController';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';

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
