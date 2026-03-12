import { Controller, Get, HTTPStatus, Param, Status } from '@vercube/core';
import { Inject } from '@vercube/di';
import { TestService } from '../services/TestService';

/**
 * Foo controller.
 * This is a sample controller that demonstrates how to create a controller using the @vercube/core package.
 */
@Controller('/api/foo')
export class FooController {
  @Inject(TestService)
  private gTestService: TestService;

  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/')
  public async index(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  @Get('/:id/testa')
  @Status(HTTPStatus.OK)
  public async show(@Param('id') id: string): Promise<{ message: string }> {
    return {
      message: `Hello, world! The id is ${id} and the test service is ${this.gTestService.getTest()}`,
    };
  }
}
