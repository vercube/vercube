import { createApp } from '@vercube/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { SchemaPlugin } from '../../src';
import { SchemaController } from '../../src/Controllers/SchameController';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';
import type { App } from '@vercube/core';

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
