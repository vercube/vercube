import {
  Controller,
  Get,
  Middleware,
  SetHeader,
  Status,
  HTTPStatus,
  Redirect,
  Post,
  Body,
  QueryParams,
  Param,
  RuntimeConfig,
  HttpStatusCode,
} from '@vercube/core';
import { Auth } from '@vercube/auth';
import { Schema } from '@vercube/schema';
import { FirstMiddleware } from '../Middlewares/FirstMiddleware';
import { z } from 'zod';
import { Inject } from '@vercube/di';
import { StorageManager } from '@vercube/storage';
import { Logger } from '@vercube/logger';
import { BasicAuthenticationProvider } from '../Services/BasicAuthenticationProvider';
import { DummyAuthorizationProvider } from '../Services/DummyAuthorizationProvider';
import { SecondMiddleware } from '../Middlewares/SecondMiddleware';
import type { AppTypes } from '../Types/AppTypes';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  age: z.number().int().min(0, 'Age must be a non-negative integer'),
});

const UserSchema = z
  .object({
    id: z.string().openapi({ example: '1212121' }),
    name: z.string().openapi({ example: 'John Doe' }),
    age: z.number().openapi({ example: 42 }),
  })
  .openapi('User');

const schemaQueryParams = z.object({
  foo: z.string().min(1, 'Foo is required'),
  bar: z.string().min(1, 'Bar is required'),
});


/**
 * Playground controller.
 * This is a sample controller that demonstrates how to create a controller using the @vercube/core package.
 */
@Controller('/api/playground')
@Middleware(FirstMiddleware)
export default class PlaygroundController {

  @Inject(StorageManager)
  private gStorageManager: StorageManager;

  @Inject(Logger)
  private gLogger: Logger;

  @Inject(RuntimeConfig)
  private gRuntimeConfig: RuntimeConfig<AppTypes.Config>;

  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/')
  @SetHeader('X-Test-Response-Header', '1')
  public async index(): Promise<{ message: string }> {
    this.gLogger.debug('PlaygroundController::index', 'Debug method');
    this.gLogger.info('PlaygroundController::index', 'Info method');
    this.gLogger.warn('PlaygroundController::index', 'Warn method');
    this.gLogger.error('PlaygroundController::index', 'Error method');
    return { message: 'Hello, world!' };
  }

  /**
   * Handles GET requests to the /authenticate endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Auth()
  @Get('/authenticate')
  public async authenticate(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  /**
   * Handles GET requests to the /basic-authentication.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/basic-authentication')
  @Auth({ provider: BasicAuthenticationProvider })
  public async basicAuthentication(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  /**
   * Handles GET requests to the /authorize endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/authorize')
  @Auth({ roles: ['admin'] })
  public async authorize(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  /**
   * Handles GET requests to the /dummy-authorization.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/dummy-authorization')
  @Auth({ roles: ['admin'], provider: DummyAuthorizationProvider })
  public async dummyAuthorization(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  /**
   * Handles GET requests to the /:id endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/:id')
  @Status(HTTPStatus.CONFLICT)
  public async get(@Param('id') id: string): Promise<{ message: string }> {
    return { message: `Hello, ${id}!` };
  }

  /**
   * Handles GET requests to the /storage endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/storage')
  public async storageGet(): Promise<{ message: string | null }> {
    const value = await this.gStorageManager.getItem<string>({ key: 'key' });

    return { message: value };
  }

  /**
   * Handles POST requests to the /storage endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Post('/storage')
  public async storageSet(): Promise<{ message: string }> {
    await this.gStorageManager.setItem({ key: 'key', value: 'value' });
    return { message: 'Storage value successfully set.' };
  }

  /**
   * Handles POST requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Post('/')
  @Schema({
    responses: {
      [HttpStatusCode.OK]: UserSchema
    },
  })
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
    return { message: 'Hello, I perform redirection!' };
  }

  /**
   * Handles GET requests to the /redirected endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/redirected')
  @Status(HTTPStatus.OK)
  public async redirected(): Promise<{ message: string }> {
    return { message: 'Hello, I am redirected!' };
  }

  /**
   * Handles GET requests to the /session endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/error')
  @Middleware(SecondMiddleware)
  public async error(): Promise<{ message: string }> {
    return { message: 'Hello, world!' };
  }

  /**
   * Handles GET requests to the /error-throw endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/error-throw')
  public async errorThrow(): Promise<{ message: string }> {
    throw new Error('Test error');
  }

  /**
   * Handles GET requests to the /runtime-config endpoint.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a greeting message.
   */
  @Get('/runtime-config')
  public async runtimeConfig(): Promise<{ message: string }> {
    const something = this.gRuntimeConfig.runtimeConfig?.something?.enabled;

    return { message: `Something is ${something ? 'enabled' : 'disabled'}` };
  }

}
