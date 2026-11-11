import { VercubeClientError } from '@vercube/client';
import { Body, Controller, Get, Header, NotFoundError, Param, Post, Throws } from '@vercube/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTestApp, TestingError } from '../../src';
import type { RouteDef } from '@vercube/client';

@Controller('/users')
export class UserController {
  @Get('/:id')
  @Throws(NotFoundError)
  public get(@Param('id') id: string): { id: string; name: string } {
    if (id === 'missing') {
      throw new NotFoundError('No such user');
    }

    return { id, name: 'Ada' };
  }

  @Post('/')
  public create(@Body() body: { name: string }, @Header('x-tenant') tenant: string): { name: string; tenant: string } {
    return { name: body.name, tenant };
  }
}

interface Routes {
  'GET /users/:id': RouteDef<UserController, 'get', { param: { id: 0 }; throws: { 404: NotFoundError } }>;
  'POST /users': RouteDef<UserController, 'create', { body: 0; header: { 'x-tenant': 1 } }>;
}

describe('app.client', () => {
  it('calls the app in memory, typed by the route map', async () => {
    await using app = await createTestApp<Routes>({ controllers: [UserController] });

    const user = await app.client.get('/users/:id', { params: { id: '1' } });

    expectTypeOf(user).toEqualTypeOf<{ id: string; name: string }>();
    expect(user).toEqual({ id: '1', name: 'Ada' });

    expect(await app.client.post('/users', { body: { name: 'Grace' }, headers: { 'x-tenant': 't1' } })).toEqual({
      name: 'Grace',
      tenant: 't1',
    });
  });

  it('throws VercubeClientError for error statuses', async () => {
    await using app = await createTestApp<Routes>({ controllers: [UserController] });

    const error = await app.client.get('/users/:id', { params: { id: 'missing' } }).catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(VercubeClientError);
    expect(error).toMatchObject({ status: 404, message: 'No such user' });
  });

  it('returns declared errors through safe', async () => {
    await using app = await createTestApp<Routes>({ controllers: [UserController] });

    const res = await app.client.safe.get('/users/:id', { params: { id: 'missing' } });

    expect(res).toMatchObject({ data: null, error: { status: 404, body: { name: 'NotFoundError' } } });

    if (res.error) {
      expectTypeOf(res.error.status).toEqualTypeOf<404>();
      expect(app.client.isRouteError(res.error, 'GET /users/:id')).toBe(true);
    }

    expect((await app.client.safe.get('/users/:id', { params: { id: '1' } })).data).toEqual({ id: '1', name: 'Ada' });
  });

  it('is untyped without a route map', async () => {
    await using app = await createTestApp({ controllers: [UserController] });

    expect(await app.client.get('/users/7')).toEqual({ id: '7', name: 'Ada' });
  });

  it('honours a custom baseUrl', async () => {
    await using app = await createTestApp<Routes>({ controllers: [UserController], baseUrl: 'http://api.test/' });

    expect(await app.client.get('/users/:id', { params: { id: '2' } })).toMatchObject({ id: '2' });
  });

  it('refuses requests once the app is closing', async () => {
    const app = await createTestApp<Routes>({ controllers: [UserController] });

    await app.close();

    await expect(app.client.get('/users/:id', { params: { id: '1' } })).rejects.toBeInstanceOf(TestingError);
  });
});
