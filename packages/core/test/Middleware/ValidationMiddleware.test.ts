import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  BadRequestError,
  Body,
  Controller,
  createApp,
  Get,
  Post,
  QueryParam,
  StandardSchemaValidationProvider,
  ValidationProvider,
} from '../../src/';
import { ValidationMiddleware } from '../../src/Middleware/ValidationMiddleware';
import { createTestApp } from '../Utils/App.mock';
import { ValidatorProviderMock, ValidatorWithIssuesProvider } from '../Utils/ValidatorProvider.mock';
import type { App, MetadataTypes } from '../../src/';

@Controller('/validation')
class ValidationController {
  @Get('/coerce')
  public coerce(
    @QueryParam({ name: 'page', validationSchema: z.coerce.number() }) page: number,
    @QueryParam({ name: 'email', validationSchema: z.string().trim().toLowerCase() }) email: string,
  ): unknown {
    return { page, email };
  }

  @Post('/body')
  public body(@Body({ validationSchema: z.object({ name: z.string() }) }) body: unknown): unknown {
    return body;
  }
}

describe('ValidationMiddleware', () => {
  let app: App;

  beforeEach(async () => {
    app = await createTestApp();
    app.container.bind(ValidationProvider, ValidatorProviderMock);
  });

  it('should skip validation if validation provider is not registered', async () => {
    app.container.bindMock(ValidationProvider, null as any);
    const middleware = app.container.resolve(ValidationMiddleware);

    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await middleware.onRequest(request, new Response(), {
      methodArgs: [],
    });

    expect(response).toBeUndefined();
  });

  it('should skip validation if no validators provided', async () => {
    const middleware = app.container.resolve(ValidationMiddleware);

    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await middleware.onRequest(request, new Response(), {
      methodArgs: [],
    });

    expect(response).toBeUndefined();
  });

  it('should skip validation if methodArgs is undefined', async () => {
    const middleware = app.container.resolve(ValidationMiddleware);

    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await middleware.onRequest(request, new Response(), {
      methodArgs: undefined,
    });

    expect(response).toBeUndefined();
  });

  it('should skip validation if no validation schema is provided', async () => {
    app.container.bind(ValidationProvider, ValidatorProviderMock);
    const middleware = app.container.resolve(ValidationMiddleware);
    const spyOn = vi.spyOn(app.container.get(ValidationProvider), 'validate');

    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await middleware.onRequest(request, new Response(), {
      methodArgs: [],
    });

    expect(spyOn).not.toHaveBeenCalled();
  });

  it('should throw error if validation fails', async () => {
    app.container.bind(ValidationProvider, ValidatorWithIssuesProvider);
    const middleware = app.container.resolve(ValidationMiddleware);

    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await expect(
      middleware.onRequest(request, new Response(), {
        methodArgs: [
          {
            type: 'body',
            idx: 0,
            validate: true,
            validationSchema: z.object({ name: z.string() }),
          },
        ],
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should replace the resolved value with the parsed one', async () => {
    app.container.bind(ValidationProvider, StandardSchemaValidationProvider);
    const middleware = app.container.resolve(ValidationMiddleware);

    const methodArgs: MetadataTypes.Arg[] = [
      {
        type: 'query-param',
        idx: 0,
        validate: true,
        validationSchema: z.coerce.number(),
        resolved: '2',
      },
      {
        type: 'query-param',
        idx: 1,
        validate: true,
        validationSchema: z.string().trim().toLowerCase(),
        resolved: ' John@Example.COM ',
      },
      {
        type: 'body',
        idx: 2,
        validate: true,
        validationSchema: z.object({ name: z.string() }),
        resolved: { name: 'John', isAdmin: true },
      },
    ];

    await middleware.onRequest(new Request('http://localhost/test'), new Response(), { methodArgs });

    expect(methodArgs.map((arg) => arg.resolved)).toEqual([2, 'john@example.com', { name: 'John' }]);
  });

  it('should keep the resolved value if the provider returns no value', async () => {
    const middleware = app.container.resolve(ValidationMiddleware);

    const methodArgs: MetadataTypes.Arg[] = [
      {
        type: 'body',
        idx: 0,
        validate: true,
        validationSchema: z.object({ name: z.string() }),
        resolved: { name: 'John' },
      },
    ];

    await middleware.onRequest(new Request('http://localhost/test'), new Response(), { methodArgs });

    expect(methodArgs[0].resolved).toEqual({ name: 'John' });
  });

  it('should pass the parsed values to the route handler', async () => {
    const app = await createApp({
      cfg: { requestLogging: false },
      setup: (instance) => {
        instance.container.bind(ValidationController);
      },
    });

    const query = await app.fetch(new Request('http://localhost/validation/coerce?page=2&email=%20John@Example.COM%20'));
    expect(await query.json()).toEqual({ page: 2, email: 'john@example.com' });

    const body = await app.fetch(
      new Request('http://localhost/validation/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John', isAdmin: true }),
      }),
    );
    expect(await body.json()).toEqual({ name: 'John' });
  });
});
