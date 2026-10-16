import { Body, Connect, Controller, createApp, Get, Header, Post, QueryParam } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { describe, expect, it, vi } from 'vitest';
import { Schema, SchemaPlugin, z } from '../../src';
import { SchemaRegistry } from '../../src/Services/SchemaRegistry';

const ok = { responses: { 200: { description: 'OK' } } };

@Controller('/c')
class CorrectnessController {
  @Connect('/tunnel')
  @Schema(ok)
  public tunnel() {
    return {};
  }

  @Get('/search')
  @Schema({ ...ok, request: { query: z.object({ a: z.string() }).transform((value) => value) as any } })
  public search(@QueryParam({ name: 'b', validationSchema: z.string() }) b: string) {
    return { b };
  }

  @Post('/upload')
  @Schema({ ...ok, request: { body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string() }) } } } } })
  public upload(@Body({ validationSchema: z.object({ title: z.string() }) }) body: unknown) {
    return body;
  }

  @Get('/headers')
  @Schema(ok)
  public headers(
    @Header('Authorization') auth: string,
    @Header('content-type') type: string,
    @Header('Accept') accept: string,
    @Header('x-tenant') tenant: string,
  ) {
    return { auth, type, accept, tenant };
  }
}

@Controller('/b')
class BrokenFirstController {
  @Get('/x')
  @Schema({ ...ok, request: { query: { '~standard': { version: 1, vendor: 'x', validate: () => ({ value: 1 }) } } as any } })
  public broken() {
    return {};
  }
}

@Controller('/b')
class WorkingSecondController {
  @Get('/x')
  @Schema(ok)
  public working() {
    return {};
  }
}

@Controller('/c')
class DuplicateController {
  @Get('/headers')
  @Schema(ok)
  public again() {
    return {};
  }
}

async function generate() {
  const app = await createApp({
    cfg: { requestLogging: false },
    setup: async (app) => {
      app.addPlugin(SchemaPlugin);
    },
  });
  const warn = vi.spyOn(app.container.get(Logger), 'warn').mockImplementation(() => {});

  app.container.expand((container) => {
    container.bind(CorrectnessController);
    container.bind(DuplicateController);
    container.bind(BrokenFirstController);
    container.bind(WorkingSecondController);
  });

  return { schema: await app.container.get(SchemaRegistry).generateSchema(), warn };
}

describe('schema document correctness', () => {
  it('should leave CONNECT routes out', async () => {
    const { schema } = await generate();

    expect(schema.paths['/c/tunnel']).toBeUndefined();
  });

  it('should merge a single @QueryParam into a transformed query schema', async () => {
    const { schema } = await generate();

    expect(schema.paths['/c/search']?.get?.parameters?.map((parameter: any) => parameter.name)).toEqual(['b', 'a']);
  });

  it('should keep a body described in @Schema as it is', async () => {
    const { schema } = await generate();

    expect(Object.keys((schema.paths['/c/upload']!.post!.requestBody as any).content)).toEqual(['multipart/form-data']);
  });

  it('should not document headers OpenAPI ignores', async () => {
    const { schema } = await generate();

    expect(schema.paths['/c/headers']?.get?.parameters?.map((parameter: any) => parameter.name)).toEqual(['x-tenant']);
  });

  it('should warn about a second controller documenting the same operation', async () => {
    const { schema, warn } = await generate();

    expect(schema.paths['/c/headers']?.get?.parameters).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      'SchemaRegistry',
      expect.stringContaining('GET /c/headers is already documented by CorrectnessController.headers'),
    );
  });

  it('should document a route whose earlier duplicate failed to generate', async () => {
    const { schema } = await generate();

    expect(schema.paths['/b/x']?.get).toBeDefined();
  });
});
