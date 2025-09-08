// oxlint-disable no-unused-vars
import { Controller, Get } from '@vercube/core';

/**
 * Playground controller.
 * This is a sample controller that demonstrates how to create a controller using the @vercube/core package.
 */
@Controller('/api/playground')
export default class PlaygroundController {
  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/')
  public async index(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }
}
