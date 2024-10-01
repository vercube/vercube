import { Controller, Get, SetHeader, Status } from '@cube/core';

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
  @SetHeader('X-Test-Response-Header', '1')
  @Status(200)
  public async index(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

}
