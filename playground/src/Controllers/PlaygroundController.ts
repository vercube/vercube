import { Controller, Get, Middleware, SetHeader, Status, HTTPStatus, Redirect, Post } from '@cube/core';
import { FirstMiddleware } from '../Middlewares/FirstMiddleware';
import { SecondMiddleware } from '../Middlewares/SecondMiddleware';

/**
 * Playground controller.
 * This is a sample controller that demonstrates how to create a controller using the @cube/core package.
 */
@Controller('/api/playground')
export default class PlaygroundController {

  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/')
  @Middleware(FirstMiddleware)
  @Middleware(SecondMiddleware)
  @SetHeader('X-Test-Response-Header', '1')
  public async index(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  /**
   * Handles GET requests to the /redirect endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/redirect')
  @Redirect('/api/playground/redirected')
  public async redirect(): Promise<{ message: string }> {
    return { message: 'Hello, i perform redirection!' };
  }

  /**
   * Handles GET requests to the /redirected endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/redirected')
  @Status(HTTPStatus.OK)
  public async redirected(): Promise<{ message: string }> {
    return { message: 'Hello, im redirected!' };
  }

  @Post('/storage')
  @Status(HTTPStatus.OK)
  public async storageSet(body: any): Promise<{ message: string, body: any }> {
    return { message: 'Hello, im storage', body };
  }

}
