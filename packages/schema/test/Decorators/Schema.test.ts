import { describe, it, expect, beforeEach } from 'vitest';
import { type App, createApp } from '@vercube/core';
import { SchemaPlugin } from '../../src';
import { MockController } from '../Utils/Schema.mock';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';

describe('SchemaDecorator', () => {
  let app: App;

  beforeEach(async () => {
    app = await createApp({
      setup: async (app) => {
        app.addPlugin(SchemaPlugin);
      },
    });

    app.container.expand((container) => {
      container.bind(MockController);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('Should register schema correctly', async () => {
    const registry = app.container.get(SchemaRegistry);
    const schema = await registry.generateSchema();

    const path = schema.paths['/mock/'];

    expect(path).toBeDefined();
    expect(path.get).toBeDefined();
    expect(path?.get?.responses['200']).toBeDefined();
    expect(
      path?.get?.responses['200']?.content['application/json']?.schema,
    ).toBeDefined();
    expect(
      path?.get?.responses['200']?.content['application/json']?.schema
        ?.properties.message,
    ).toBeDefined();
    expect(
      path?.get?.responses['200']?.content['application/json']?.schema
        ?.properties.message.type,
    ).toBe('string');
  });

  it('should generate schema correctly', async () => {
    const registry = app.container.get(SchemaRegistry);
    const schema = await registry.generateSchema();

    expect(schema).toMatchSnapshot();
  });
});
