import { Controller, Get, Middleware, SetHeader, Status } from '@cube/core';
import { FirstMiddleware } from '../Middlewares/FirstMiddleware';
import { SecondMiddleware } from '../Middlewares/SecondMiddleware';

/**
 * Playground controller.
 * This is a sample controller that demonstrates how to create a controller using the @cube/core package.
 */
@Controller('/api/playground')
export default class PlaygroundController {

  /**
   * Handles GET requests to the /test1 endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/')
  @Middleware(FirstMiddleware)
  @Middleware(SecondMiddleware)
  @SetHeader('X-Test-Response-Header', '1')
  @Status(200)
  public async index(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

}
