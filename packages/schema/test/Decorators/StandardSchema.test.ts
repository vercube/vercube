import { Body, Controller, createApp, Get, Param, Post, QueryParam, QueryParams } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as zm from 'zod/mini';
import { Schema, SchemaPlugin } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { App } from '@vercube/core';

/**
 * A Standard Schema from a vendor other than zod, with an optional JSON Schema converter.
 */
function vendorSchema(json?: Record<string, unknown>, required = true): StandardSchemaV1 & Partial<StandardJSONSchemaV1> {
  return {
    '~standard': {
      version: 1,
      vendor: 'valibot',
      validate: (value: unknown) => (value === undefined && required ? { issues: [{ message: 'required' }] } : { value }),
      ...(json
        ? { jsonSchema: { input: () => ({ $schema: 'http://json-schema.org/draft-07/schema#', ...json }), output: () => json } }
        : {}),
    },
  } as any;
}

const objectJson = {
  type: 'object',
  properties: { a: { type: 'string' }, b: { type: 'number' } },
  required: ['a'],
};

@Controller('/standard')
class StandardSchemaController {
  @Post('/body')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public body(@Body({ validationSchema: vendorSchema(objectJson) }) body: unknown) {
    return body;
  }

  @Post('/body-no-converter')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public bodyNoConverter(@Body({ validationSchema: vendorSchema() }) body: unknown) {
    return body;
  }

  @Post('/mini')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public mini(@Body({ validationSchema: zm.object({ a: zm.string() }) }) body: unknown) {
    return body;
  }

  @Get('/query')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public query(@QueryParams({ validationSchema: vendorSchema(objectJson) }) query: unknown) {
    return query;
  }

  @Get('/query-no-converter')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public queryNoConverter(@QueryParams({ validationSchema: vendorSchema() }) query: unknown) {
    return query;
  }

  @Get('/named/:id')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public named(
    @Param({ name: 'id', validationSchema: zm.string() }) id: string,
    @QueryParam({ name: 'limit', validationSchema: vendorSchema({ type: 'integer' }) }) limit: number,
    @QueryParam({ name: 'page', validationSchema: zm.optional(zm.string()) }) page: string,
  ) {
    return { id, limit, page };
  }

  @Get('/no-responses')
  @Schema({ summary: 'x' } as any)
  public noResponses() {
    return {};
  }

  @Get('/broken')
  @Schema({ responses: { 200: { description: 'OK' } }, request: { query: vendorSchema() } } as any)
  public broken() {
    return {};
  }
}

describe('Standard Schema documentation', () => {
  let app: App;
  let warn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    app = await createApp({
      cfg: { requestLogging: false },
      setup: async (app) => {
        app.addPlugin(SchemaPlugin);
      },
    });

    warn = vi.fn();
    vi.spyOn(app.container.get(Logger), 'warn').mockImplementation(warn as any);

    app.container.expand((container) => {
      container.bind(StandardSchemaController);
    });
  });

  it('should document a non-zod body through its JSON Schema converter', async () => {
    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect((schema.paths['/standard/body']?.post?.requestBody as any)?.content['application/json']?.schema).toEqual(objectJson);
  });

  it('should skip a non-zod body without a converter and warn', async () => {
    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/standard/body-no-converter']?.post?.requestBody).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('SchemaRegistry', expect.stringContaining('bodyNoConverter'));
  });

  it('should document a zod/mini body', async () => {
    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect((schema.paths['/standard/mini']?.post?.requestBody as any)?.content['application/json']?.schema).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
    });
  });

  it('should document non-zod query params as parameters', async () => {
    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/standard/query']?.get?.parameters).toEqual([
      expect.objectContaining({ in: 'query', name: 'a', required: true, schema: expect.objectContaining({ type: 'string' }) }),
      expect.objectContaining({ in: 'query', name: 'b', required: false, schema: expect.objectContaining({ type: 'number' }) }),
    ]);
    expect(schema.paths['/standard/query-no-converter']?.get?.parameters).toBeUndefined();
  });

  it('should document zod/mini and other vendors on named params', async () => {
    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/standard/named/{id}']?.get?.parameters).toEqual([
      expect.objectContaining({ in: 'path', name: 'id', required: true, schema: expect.objectContaining({ type: 'string' }) }),
      expect.objectContaining({
        in: 'query',
        name: 'limit',
        required: true,
        schema: expect.objectContaining({ type: 'integer' }),
      }),
      expect.objectContaining({
        in: 'query',
        name: 'page',
        required: false,
        schema: expect.objectContaining({ type: 'string' }),
      }),
    ]);
  });

  it('should default responses when @Schema has none', async () => {
    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/standard/no-responses']?.get?.responses).toEqual({ 200: { description: 'OK' } });
  });

  it('should leave a broken route out instead of failing the whole document', async () => {
    const schema = await app.container.get(SchemaRegistry).generateSchema();

    expect(schema.paths['/standard/broken']).toBeUndefined();
    expect(schema.paths['/standard/body']).toBeDefined();
    expect(warn).toHaveBeenCalledWith('SchemaRegistry', expect.stringContaining('StandardSchemaController.broken'));
  });
});
