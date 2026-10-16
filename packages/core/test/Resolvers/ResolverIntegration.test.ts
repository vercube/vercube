import { describe, expect, it } from 'vitest';
import { Controller, createApp, Get, Header, Headers, MultipartFormData, Param, Post } from '../../src';

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
});
