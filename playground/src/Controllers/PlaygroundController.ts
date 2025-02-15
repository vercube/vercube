import { Controller, Get, Middleware, SetHeader, Status, HTTPStatus, Redirect, Post, Body, QueryParams } from '@vercube/core';
import { Auth } from '@vercube/auth';
import { FirstMiddleware } from '../Middlewares/FirstMiddleware';
import { SecondMiddleware } from '../Middlewares/SecondMiddleware';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  age: z.number().int().min(0, 'Age must be a non-negative integer'),
});

const schemaQueryParams  = z.object({
  foo: z.string().min(1, 'Foo is required'),
  bar: z.string().min(1, 'Bar is required'),
});

/**
 * Playground controller.
 * This is a sample controller that demonstrates how to create a controller using the @vercube/core package.
 */
@Controller('/api/playground')
@Middleware(FirstMiddleware)
@Auth()
export default class PlaygroundController {

  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/')
  @Middleware(SecondMiddleware)
  @SetHeader('X-Test-Response-Header', '1')
  public async index(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  /**
   * Handles POST requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Post('/')
  public async post(
    @Body({ validationSchema: schema }) body: unknown,
    @QueryParams({ validationSchema: schemaQueryParams }) query: string,
  ): Promise<{ message: string }> {
    console.log('Body =>', body);
    console.log('Query =>', query);

    return { message: JSON.stringify(body) };
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

}
