import { Controller, createApp, Get, MetadataResolver, Param } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { Schema, SchemaPlugin } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';

@Controller('/moved')
class MovedController {
  @Get('/x')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public x() {
    return {};
  }
}

@Controller('noslash')
class NoSlashController {
  @Get(String.raw`/:id(\d+)`)
  @Schema({ responses: { 200: { description: 'OK' } } })
  public get(@Param('id') id: string) {
    return { id };
  }
}

describe('documented paths', () => {
  it('should document the path the application serves the controller at', async () => {
    const app = await createApp({
      cfg: { requestLogging: false },
      setup: async (app) => {
        app.addPlugin(SchemaPlugin);
        app.container.get(MetadataResolver).setControllerPath(MovedController, '/v2');
        app.container.bind(MovedController);
        app.container.bind(NoSlashController);
      },
    });

    expect((await app.fetch(new Request('http://localhost/v2/x'))).status).toBe(200);

    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/v2/x']).toBeDefined();
    expect(schema.paths['/moved/x']).toBeUndefined();
    expect(schema.paths['/noslash/{id}']?.get?.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true, schema: expect.objectContaining({ pattern: '\\d+' }) }),
    ]);
  });
});
