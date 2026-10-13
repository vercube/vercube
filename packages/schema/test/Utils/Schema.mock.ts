import { Controller, Get, Param } from '@vercube/core';
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
}
