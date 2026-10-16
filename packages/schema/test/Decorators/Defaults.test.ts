import {
  BaseMiddleware,
  Body,
  Controller,
  createApp,
  Get,
  GlobalMiddlewareRegistry,
  Middleware,
  MultipartFormData,
  Post,
  Redirect,
  SetHeader,
  Sse,
  Status,
} from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { Schema, SchemaPlugin } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';
import type { SchemaPluginOptions } from '../../src/Types/SchemaPluginOptions';

/** Stands in for `AuthMiddleware`, which carries the same marker. */
class FakeAuth extends BaseMiddleware {
  public override onRequest(): void {}
}
Object.defineProperty(FakeAuth, Symbol.for('vercube.auth.middleware'), { value: true });

@Controller('/items')
class ItemsController {
  @Post('/')
  @Status(201)
  @SetHeader('Cache-Control', 'no-store')
  @Schema({})
  public create(@Body() body: unknown) {
    return body;
  }

  @Get('/old')
  @Redirect('/items', 301)
  @Schema({})
  public old() {}

  @Sse('/events')
  @Schema({})
  public async *events() {}

  @Post('/upload')
  @Schema({})
  public upload(@MultipartFormData() form: unknown) {
    return form;
  }

  @Get('/named')
  @Schema({ operationId: 'listItems', tags: ['catalog'], responses: { 200: { description: 'The items' } } })
  public named() {
    return [];
  }

  @Get('/secret')
  @Middleware(FakeAuth)
  @Schema({})
  public secret() {
    return {};
  }

  @Get('/undocumented')
  public undocumented() {
    return {};
  }
}

async function generate(options: SchemaPluginOptions = {}, appWideAuth = false) {
  const app = await createApp({
    cfg: { requestLogging: false },
    setup: async (app) => {
      app.addPlugin(SchemaPlugin, options);

      if (appWideAuth) {
        app.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(FakeAuth);
      }
    },
  });

  app.container.expand((container) => container.bind(ItemsController));

  return app.container.get(SchemaRegistry).generateSchema();
}

const bearer = { securitySchemes: { bearerAuth: { type: 'http' as const, scheme: 'bearer' } } };

describe('defaults derived from the route', () => {
  it('should document the status and headers the route declares', async () => {
    const schema = await generate();

    expect(schema.paths['/items/']?.post?.responses).toEqual({
      201: { description: 'Created', headers: { 'Cache-Control': { schema: { type: 'string', example: 'no-store' } } } },
    });
    expect(schema.paths['/items/old']?.get?.responses).toEqual({
      301: { description: 'Moved Permanently', headers: { Location: { schema: { type: 'string', example: '/items' } } } },
    });
  });

  it('should document an SSE route as an event stream', async () => {
    const schema = await generate();

    expect(schema.paths['/items/events']?.get?.responses).toEqual({
      200: { description: 'OK', content: { 'text/event-stream': { schema: { type: 'string' } } } },
    });
  });

  it('should document bodies read without a schema', async () => {
    const schema = await generate();

    expect((schema.paths['/items/']!.post!.requestBody as any).content).toEqual({ 'application/json': { schema: {} } });
    expect((schema.paths['/items/upload']!.post!.requestBody as any).content).toEqual({
      'multipart/form-data': { schema: { type: 'object' } },
    });
  });

  it('should derive operationId and tags, unless @Schema sets them', async () => {
    const schema = await generate();

    expect(schema.paths['/items/']?.post).toMatchObject({ operationId: 'ItemsController_create', tags: ['ItemsController'] });
    expect(schema.paths['/items/named']?.get).toMatchObject({
      operationId: 'listItems',
      tags: ['catalog'],
      responses: { 200: { description: 'The items' } },
    });
  });

  it('should require the security schemes on a guarded route', async () => {
    const schema = await generate({ components: bearer });

    expect(schema.paths['/items/secret']?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(schema.paths['/items/']?.post?.security).toBeUndefined();
  });

  it('should mark public routes when security is required globally', async () => {
    const schema = await generate({ components: bearer, document: { security: [{ bearerAuth: [] }] } });

    expect(schema.paths['/items/']?.post?.security).toEqual([]);
    expect(schema.paths['/items/secret']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('should use the security option and an app-wide auth middleware', async () => {
    const schema = await generate({ components: bearer, security: [{ bearerAuth: ['admin'] }] }, true);

    expect(schema.paths['/items/']?.post?.security).toEqual([{ bearerAuth: ['admin'] }]);
  });

  it('should document routes without @Schema only with includeAllRoutes', async () => {
    expect((await generate()).paths['/items/undocumented']).toBeUndefined();

    const schema = await generate({ includeAllRoutes: true });

    expect(schema.paths['/items/undocumented']?.get).toMatchObject({
      operationId: 'ItemsController_undocumented',
      responses: { 200: { description: 'OK' } },
    });
    // the schema endpoints themselves stay out
    expect(Object.keys(schema.paths).some((path) => path.startsWith('/_schema'))).toBe(false);
  });
});
