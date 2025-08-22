import { Controller, Get } from '@vercube/core';
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
