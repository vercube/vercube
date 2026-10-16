import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  Controller,
  createApp,
  Get,
  Header,
  Headers,
  MultipartFormData,
  Param,
  Post,
  QueryParam,
  QueryParams,
  StandardSchemaValidationProvider,
  ValidationProvider,
} from '../../src';

@Controller('/resolvers')
class ResolverController {
  @Get('/header')
  public header(@Header('x-missing') value: string = 'dflt') {
    return { value };
  }

  @Get('/headers')
  public headers(@Headers() headers: Record<string, string>) {
    return { custom: headers['x-custom'], headers };
  }

  @Post('/upload')
  public upload(@MultipartFormData() form: { title: string; file: File }) {
    return { title: form.title, file: form.file.name };
  }
}

@Controller('/query')
class QueryController {
  @Get('/one')
  public one(@QueryParam({ name: 'tag', array: true, validationSchema: z.array(z.string()).min(1) }) tags: string[]) {
    return { tags };
  }

  @Get('/all')
  public all(
    @QueryParams({ arrays: ['tag'], validationSchema: z.object({ tag: z.array(z.string()), page: z.coerce.number() }) })
    query: unknown,
  ) {
    return query;
  }
}

@Controller('/typo')
class TypoController {
  @Get('/:id')
  public get(@Param('nmae') id: string) {
    return { id };
  }
}

describe('resolvers in an application', () => {
  it('should apply a parameter default for a missing header', async () => {
    const app = await createApp({ cfg: { requestLogging: false }, setup: (app) => app.container.bind(ResolverController) });

    const response = await app.fetch(new Request('http://localhost/resolvers/header'));

    expect(await response.json()).toEqual({ value: 'dflt' });
  });

  it('should hand @Headers() a plain object', async () => {
    const app = await createApp({ cfg: { requestLogging: false }, setup: (app) => app.container.bind(ResolverController) });

    const response = await app.fetch(new Request('http://localhost/resolvers/headers', { headers: { 'X-Custom': 'yes' } }));
    const body = await response.json();

    expect(body.custom).toBe('yes');
    expect(body.headers['x-custom']).toBe('yes');
  });

  it('should parse @MultipartFormData()', async () => {
    const app = await createApp({ cfg: { requestLogging: false }, setup: (app) => app.container.bind(ResolverController) });
    const form = new FormData();
    form.append('title', 'hello');
    form.append('file', new File(['x'], 'a.txt'));

    const response = await app.fetch(new Request('http://localhost/resolvers/upload', { method: 'POST', body: form }));

    expect(await response.json()).toEqual({ title: 'hello', file: 'a.txt' });
  });

  it('should fail at boot for a @Param that is not in the path', async () => {
    await expect(
      createApp({ cfg: { requestLogging: false }, setup: (app) => app.container.bind(TypoController) }).then((app) =>
        app.container.flushQueue(),
      ),
    ).rejects.toThrow("@Param('nmae') on TypoController.get is not a parameter of the route path /typo/:id");
  });

  it('should resolve repeated query parameters as validated arrays', async () => {
    const app = await createApp({
      cfg: { requestLogging: false },
      setup: (app) => {
        app.container.bind(ValidationProvider, StandardSchemaValidationProvider);
        app.container.bind(QueryController);
      },
    });

    const one = await app.fetch(new Request('http://localhost/query/one?tag=a&tag=b'));
    expect(await one.json()).toEqual({ tags: ['a', 'b'] });

    const all = await app.fetch(new Request('http://localhost/query/all?tag=a&page=2&tag=b&page=3'));
    expect(await all.json()).toEqual({ tag: ['a', 'b'], page: 2 });

    expect((await app.fetch(new Request('http://localhost/query/one'))).status).toBe(400);
  });
});
