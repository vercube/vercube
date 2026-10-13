import { Controller, Get, Header, Param, QueryParam } from '@vercube/core';
import { Schema, z } from '../../src';

@Controller('/mock')
export class MockController {
  @Get('/')
  @Schema({
    responses: {
      200: {
        description: 'Mock schema',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
    },
  })
  public async getMock() {
    return {
      message: 'Hello, world!',
    };
  }
}

@Controller('/mock-params')
export class MockParamsController {
  @Get('/pages/:pageId/comments/:id')
  @Schema({ responses: { 200: { description: 'Comment' } } })
  public getComment(@Param('pageId') pageId: string, @Param('id') id: string) {
    return { pageId, id };
  }

  @Get('/users/:id')
  @Schema({ responses: { 200: { description: 'User' } } })
  public getUser(@Param({ name: 'id', validationSchema: z.coerce.number().int().positive() }) id: number) {
    return { id };
  }

  @Get('/search')
  @Schema({ responses: { 200: { description: 'Results' } } })
  public search(
    @QueryParam({ name: 'producerId', validationSchema: z.string().uuid() }) producerId: string,
    @QueryParam({ name: 'q' }) q: string,
    @QueryParam({ name: 'limit', validationSchema: z.coerce.number() }) limit: number,
    @QueryParam({ name: 'page', validationSchema: z.coerce.number().optional() }) page: number | undefined,
    @Header('x-tenant') tenant: string,
  ) {
    return { producerId, q, limit, page, tenant };
  }
}

@Controller('/mock-order')
export class MockOrderController {
  @Get('/schema-below')
  @Schema({ responses: { 200: { description: 'OK' } } })
  public schemaBelow() {
    return {};
  }

  @Schema({ responses: { 200: { description: 'OK' } } })
  @Get('/schema-above')
  public schemaAbove() {
    return {};
  }

  @Schema({ responses: { 200: { description: 'OK' } } })
  public notARoute() {
    return {};
  }
}
