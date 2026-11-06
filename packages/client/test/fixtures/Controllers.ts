import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  MultipartFormData,
  Param,
  Post,
  Put,
  QueryParam,
  QueryParams,
  Request,
  Sse,
} from '@vercube/core';
import type { RouteDef } from '../../src';

export interface User {
  id: string;
  name: string;
  createdAt: Date;
}

export interface CreateUser {
  name: string;
  role?: 'admin' | 'user';
}

@Controller('/users')
export class UserController {
  @Get('/:id')
  public async getUser(@Param('id') id: string): Promise<User> {
    return { id, name: `user-${id}`, createdAt: new Date(0) };
  }

  @Get('/')
  public list(
    @QueryParam({ name: 'page' }) page: string | undefined,
    @QueryParam({ name: 'tag', array: true }) tag: string[],
    @QueryParam({ name: 'sort' }) sort: 'asc' | 'desc',
  ): { page: string | undefined; tag: string[]; sort: string } {
    return { page, tag, sort };
  }

  @Post('/')
  public create(@Body() body: CreateUser, @Header('x-tenant') tenant: string): User & { tenant: string } {
    return { id: '1', name: body.name, createdAt: new Date(0), tenant };
  }

  @Put('/:id')
  public replace(@Param('id') id: string, @Body() body: CreateUser | undefined): { id: string; name?: string } {
    return { id, name: body?.name };
  }

  @Delete('/:id')
  public remove(): void {}

  @Get('/search')
  public search(@QueryParams() query: { q: string; limit?: number }): typeof query {
    return query;
  }

  @Get('/:id/avatar')
  public avatar(): Response {
    return new Response('png', { headers: { 'content-type': 'image/png' } });
  }

  @Post('/:id/avatar')
  public upload(
    @Param('id') id: string,
    @MultipartFormData() form: { file: File; caption: string },
  ): { id: string; size: number; caption: string } {
    return { id, size: form.file.size, caption: form.caption };
  }

  @Post('/raw')
  public async raw(@Request() request: globalThis.Request): Promise<string> {
    return request.text();
  }

  @Get('/fail')
  public fail(): never {
    throw new Error('nope');
  }

  @Get('/files/**:path')
  public file(@Param('path') path: string): string {
    return path;
  }
}

@Controller('/events')
export class EventsController {
  @Sse('/ticks')
  public async *ticks(): AsyncGenerator<{ event: 'tick'; data: { n: number } } | { event: 'done' }> {
    yield { event: 'tick', data: { n: 1 } };
    yield { event: 'tick', data: { n: 2 } };
    yield { event: 'done' };
  }

  @Sse('/words')
  public *words(): Generator<string> {
    yield 'hello';
    yield 'world';
  }
}

/** A controller registered under a path other than its decorator says, via `setControllerPath()`. */
@Controller('/old')
export class MovedController {
  @Get('/ping')
  public ping(@QueryParam({ name: 'echo' }) echo: string): { echo: string } {
    return { echo };
  }
}

/** The route map the generator writes for the controllers above, by hand. */
export interface TestRoutes {
  'GET /users/:id': RouteDef<UserController, 'getUser', { param: { id: 0 } }>;
  'HEAD /users/:id': RouteDef<UserController, 'getUser', { param: { id: 0 } }>;
  'GET /users': RouteDef<UserController, 'list', { query: { page: 0; tag: 1; sort: 2 } }>;
  'POST /users': RouteDef<UserController, 'create', { body: 0; header: { 'x-tenant': 1 } }>;
  'PUT /users/:id': RouteDef<UserController, 'replace', { param: { id: 0 }; body: 1 }>;
  'DELETE /users/:id': RouteDef<UserController, 'remove', { param: { id: null } }>;
  'GET /users/search': RouteDef<UserController, 'search', { queries: 0 }>;
  'GET /users/:id/avatar': RouteDef<UserController, 'avatar', { param: { id: null } }>;
  'POST /users/:id/avatar': RouteDef<UserController, 'upload', { param: { id: 0 }; form: 1 }>;
  'POST /users/raw': RouteDef<UserController, 'raw'>;
  'GET /users/fail': RouteDef<UserController, 'fail'>;
  'GET /users/files/**:path': RouteDef<UserController, 'file', { param: { path: 0 } }>;
  'GET /events/ticks': RouteDef<EventsController, 'ticks', { sse: true }>;
  'GET /events/words': RouteDef<EventsController, 'words', { sse: true }>;
  'GET /v2/ping': RouteDef<MovedController, 'ping', { query: { echo: 0 } }>;
}
