import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BadRequestError, ValidationProvider } from '../../src/';
import { ValidationMiddleware } from '../../src/Middleware/ValidationMiddleware';
import { createTestApp } from '../Utils/App.mock';
import { ValidatorProviderMock, ValidatorWithIssuesProvider } from '../Utils/ValidatorProvider.mock';
import type { App } from '../../src/';

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
});
