import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Body, Controller, createApp, IntrospectionRegistry, Param, Post, Put, QueryParams } from '../../../src';
import { defaultConfig } from '../../../src/Config/DefaultConfig';
import { describeSchema } from '../../../src/Services/Introspection/Providers/RoutesProvider';
import type { App } from '../../../src';
import type { IntrospectionTypes } from '../../../src/Types/IntrospectionTypes';

const UserSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0),
  tags: z.array(z.string()).optional(),
});

const FilterSchema = z.object({ q: z.string(), limit: z.coerce.number().int().optional() });

const convert = vi.fn((_options: { target: string }) => ({ type: 'string', minLength: 3 }));

/** A Standard Schema that validates and describes itself, with a spy on the conversion. */
const SpiedSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
    jsonSchema: { input: convert, output: convert },
  },
};

/** A Standard Schema with no JSON Schema converter. */
const OpaqueSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
};

@Controller('/users')
class UsersController {
  @Put('/:id')
  public update(
    @Param({ name: 'id', validationSchema: SpiedSchema }) id: string,
    @Body({ validationSchema: UserSchema }) body: unknown,
    @QueryParams({ validationSchema: FilterSchema }) query: unknown,
  ): unknown {
    return { id, body, query };
  }

  @Post('/opaque/:id')
  public opaque(@Param('id') id: string, @Body({ validationSchema: OpaqueSchema }) body: unknown): unknown {
    return { id, body };
  }
}

describe('route description schemas', () => {
  let app: App;
  let routes: IntrospectionTypes.RouteDescription[];

  beforeAll(async () => {
    app = await createApp({
      cfg: { ...defaultConfig, requestLogging: false, logLevel: 'error' },
      setup: (instance) => {
        instance.container.bind(UsersController);
      },
    });

    const section = await app.container.get(IntrospectionRegistry).describe<IntrospectionTypes.RouteDescription[]>('routes');

    routes = section!.data;
  });

  /**
   * Finds one argument of a described route.
   *
   * @param id - Route id
   * @param type - Decorator kind of the argument
   * @returns The argument description
   */
  function arg(id: string, type: string): IntrospectionTypes.RouteArg {
    return routes.find((route) => route.id === id)!.args.find((candidate) => candidate.type === type)!;
  }

  it('describes the body schema of a validated argument', () => {
    expect(arg('PUT /users/:id', 'body')).toMatchObject({
      validated: true,
      schema: {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string', minLength: 1 },
          age: { type: 'integer', minimum: 0 },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    });
  });

  it('describes query and param schemas', () => {
    expect(arg('PUT /users/:id', 'query-params').schema).toMatchObject({
      type: 'object',
      required: ['q'],
      properties: { q: { type: 'string' } },
    });
    expect(arg('PUT /users/:id', 'param')).toMatchObject({ name: 'id', schema: { type: 'string', minLength: 3 } });
  });

  it('drops the dialect marker', () => {
    expect(arg('PUT /users/:id', 'body').schema).not.toHaveProperty('$schema');
  });

  it('leaves the field absent without a schema or without a converter', () => {
    expect(arg('POST /users/opaque/:id', 'param')).not.toHaveProperty('schema');
    expect(arg('POST /users/opaque/:id', 'body')).toMatchObject({ validated: true });
    expect(arg('POST /users/opaque/:id', 'body')).not.toHaveProperty('schema');
  });

  it('never converts a schema while a request is handled', async () => {
    convert.mockClear();

    const response = await app.fetch(
      new Request('http://localhost/users/abc?q=x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ada', age: 36 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(convert).not.toHaveBeenCalled();
  });

  it('converts once per described revision', async () => {
    convert.mockClear();

    // A fresh application, so the first describe of its route table is seen here.
    const fresh = await createApp({
      cfg: { ...defaultConfig, requestLogging: false, logLevel: 'error' },
      setup: (instance) => {
        instance.container.bind(UsersController);
      },
    });
    const registry = fresh.container.get(IntrospectionRegistry);

    // Booting converts nothing: the schema is only described when somebody asks.
    expect(convert).not.toHaveBeenCalled();

    await registry.describe('routes');

    // One schema with a converter on the route table, converted exactly once.
    expect(convert).toHaveBeenCalledTimes(1);

    await registry.describe('routes');
    await registry.describe('routes');

    expect(convert).toHaveBeenCalledTimes(1);
  });
});

describe('describeSchema', () => {
  /**
   * Builds a schema around a converter.
   *
   * @param input - The `jsonSchema.input` implementation
   * @returns A value shaped like a Standard JSON Schema
   */
  function withConverter(input: unknown): unknown {
    return { '~standard': { version: 1, vendor: 'test', jsonSchema: { input } } };
  }

  it('returns undefined for values that are not schemas', () => {
    expect(describeSchema(undefined)).toBeUndefined();
    expect(describeSchema(null)).toBeUndefined();
    expect(describeSchema('text')).toBeUndefined();
    expect(describeSchema({})).toBeUndefined();
    expect(describeSchema(withConverter('not a function'))).toBeUndefined();
  });

  it('falls back to draft-07 when the newer dialect is not supported', () => {
    const input = vi.fn(({ target }: { target: string }) => {
      if (target !== 'draft-07') {
        throw new Error(`Unsupported target: ${target}`);
      }

      return { $schema: 'http://json-schema.org/draft-07/schema#', type: 'number' };
    });

    expect(describeSchema(withConverter(input))).toEqual({ type: 'number' });
    expect(input.mock.calls.map(([options]) => options.target)).toEqual(['draft-2020-12', 'draft-07']);
  });

  it('returns undefined when the schema cannot be represented', () => {
    const input = (): never => {
      throw new Error('Transforms cannot be represented in JSON Schema');
    };

    expect(describeSchema(withConverter(input))).toBeUndefined();
  });

  it('returns undefined when the converter answers with something else', () => {
    expect(describeSchema(withConverter(() => null))).toBeUndefined();
    expect(describeSchema(withConverter(() => 'string'))).toBeUndefined();
  });

  it('drops a schema that cannot be serialised', () => {
    const cyclic: Record<string, unknown> = { type: 'object' };
    cyclic.self = cyclic;

    expect(describeSchema(withConverter(() => cyclic))).toBeUndefined();
  });

  it('survives a schema whose accessor throws', () => {
    const hostile = {
      get '~standard'(): never {
        throw new Error('boom');
      },
    };

    expect(describeSchema(hostile)).toBeUndefined();
  });

  it('keeps what zod can represent and drops what it cannot', () => {
    expect(describeSchema(z.string().transform((value) => value.length))).toMatchObject({ type: 'string' });
    expect(describeSchema(z.custom<string>(() => true))).toBeUndefined();
  });
});
