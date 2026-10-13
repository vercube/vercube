import { createApp } from '@vercube/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { SchemaPlugin } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';
import { MockController, MockOrderController, MockParamsController } from '../Utils/Schema.mock';
import type { App } from '@vercube/core';

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
      container.bind(MockParamsController);
    });
  });

  it('Should register schema correctly', async () => {
    const registry = app.container.get(SchemaRegistry);
    const schema = await registry.generateSchema();

    const path = schema.paths['/mock/'];

    expect(path).toBeDefined();
    expect(path.get).toBeDefined();
    expect(path?.get?.responses['200']).toBeDefined();
    expect(path?.get?.responses['200']?.content['application/json']?.schema).toBeDefined();
    expect(path?.get?.responses['200']?.content['application/json']?.schema?.properties.message).toBeDefined();
    expect(path?.get?.responses['200']?.content['application/json']?.schema?.properties.message.type).toBe('string');
  });

  it('should convert path params to OpenAPI syntax and declare them', async () => {
    const registry = app.container.get(SchemaRegistry);
    const schema = await registry.generateSchema();

    expect(schema.paths['/mock-params/pages/:pageId/comments/:id']).toBeUndefined();

    const path = schema.paths['/mock-params/pages/{pageId}/comments/{id}'];
    expect(path?.get?.parameters).toEqual([
      { schema: { type: 'string' }, required: true, name: 'pageId', in: 'path' },
      { schema: { type: 'string' }, required: true, name: 'id', in: 'path' },
    ]);
  });

  it('should document a path param with the validationSchema of @Param', async () => {
    const registry = app.container.get(SchemaRegistry);
    const schema = await registry.generateSchema();

    expect(schema.paths['/mock-params/users/{id}']?.get?.parameters).toEqual([
      { schema: { type: 'integer', exclusiveMinimum: true, minimum: 0 }, required: true, name: 'id', in: 'path' },
    ]);
  });

  it('should document single @QueryParam and @Header args', async () => {
    const registry = app.container.get(SchemaRegistry);
    const schema = await registry.generateSchema();

    expect(schema.paths['/mock-params/search']?.get?.parameters).toEqual([
      { schema: { type: 'string', format: 'uuid' }, required: true, name: 'producerId', in: 'query' },
      { schema: { type: 'string' }, required: false, name: 'q', in: 'query' },
      // a missing value is undefined, which z.coerce.number() rejects, so it is required
      { schema: { type: 'number', nullable: true }, required: true, name: 'limit', in: 'query' },
      { schema: { type: 'number', nullable: true }, required: false, name: 'page', in: 'query' },
      { schema: { type: 'string' }, required: false, name: 'x-tenant', in: 'header' },
    ]);
  });

  it('should generate schema correctly', async () => {
    const registry = app.container.get(SchemaRegistry);
    const schema = await registry.generateSchema();

    expect(schema).toMatchSnapshot();
  });

  it('should document routes right after container init, without waiting a tick', async () => {
    const app = await createApp({ setup: async (app) => app.addPlugin(SchemaPlugin) });
    app.container.expand((container) => container.bind(MockController));

    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/mock/']).toBeDefined();
  });

  it('should not depend on the order of @Schema and the route decorator', async () => {
    const app = await createApp({ setup: async (app) => app.addPlugin(SchemaPlugin) });
    app.container.expand((container) => container.bind(MockOrderController));

    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/mock-order/schema-below']?.get).toBeDefined();
    expect(schema.paths['/mock-order/schema-above']?.get).toBeDefined();
  });

  it('should skip @Schema on a method without a route decorator', async () => {
    const app = await createApp({ setup: async (app) => app.addPlugin(SchemaPlugin) });
    app.container.expand((container) => container.bind(MockOrderController));

    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(Object.keys(schema.paths)).toEqual(['/mock-order/schema-below', '/mock-order/schema-above']);
  });
});
