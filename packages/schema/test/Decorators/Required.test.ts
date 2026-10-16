import { Body, Controller, createApp, Get, Post, QueryParams } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { Schema, SchemaPlugin, z } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';

@Controller('/required')
class RequiredController {
  @Post('/body')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public body(@Body({ validationSchema: z.object({ a: z.string() }) }) body: unknown) {
    return body;
  }

  @Post('/optional-body')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public optionalBody(@Body({ validationSchema: z.object({ a: z.string() }).optional() }) body: unknown) {
    return body;
  }

  @Get('/query')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public query(
    @QueryParams({
      validationSchema: z.object({ page: z.coerce.number(), q: z.string().optional(), size: z.coerce.number().default(10) }),
    })
    query: unknown,
  ) {
    return query;
  }
}

async function generate() {
  const app = await createApp({
    cfg: { requestLogging: false },
    setup: async (app) => {
      app.addPlugin(SchemaPlugin);
    },
  });

  app.container.expand((container) => container.bind(RequiredController));

  return app.container.get(SchemaRegistry).generateSchema();
}

describe('required request parts', () => {
  it('should mark a validated body required unless it accepts undefined', async () => {
    const schema = await generate();

    expect((schema.paths['/required/body']?.post?.requestBody as any)?.required).toBe(true);
    expect((schema.paths['/required/optional-body']?.post?.requestBody as any)?.required).toBe(false);
  });

  it('should mark @QueryParams fields required when validation rejects them missing, without nullable', async () => {
    const schema = await generate();

    expect(schema.paths['/required/query']?.get?.parameters).toEqual([
      { schema: { type: 'number' }, required: true, name: 'page', in: 'query' },
      { schema: { type: 'string' }, required: false, name: 'q', in: 'query' },
      expect.objectContaining({ required: false, name: 'size', in: 'query' }),
    ]);
  });
});
