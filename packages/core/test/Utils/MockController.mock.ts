// oxlint-disable no-unused-vars
import { z } from 'zod';
import {
  Body,
  Connect,
  Controller,
  Delete,
  Get,
  Head,
  Header,
  Headers,
  Middleware,
  MultipartFormData,
  Options,
  Param,
  Patch,
  Post,
  Put,
  QueryParam,
  QueryParams,
  Redirect,
  Request,
  Response,
  SetHeader,
  Status,
  Trace,
} from '../../src';
import { TestMiddleware } from './Middleware.mock';

@Controller('/mock')
@Middleware(TestMiddleware)
export class MockController {
  @Get('/get')
  public get(): void {}

  @Post('/post')
  public post(): void {}

  @Put('/put')
  public put(): void {}

  @Delete('/delete')
  public delete(): void {}

  @Patch('/patch')
  public patch(): void {}

  @Trace('/trace')
  public trace(): void {}

  @Head('/head')
  public head(): void {}

  @Connect('/connect')
  public connect(): void {}

  @Options('/options')
  public options(): void {}

  @Post('/body')
  public body(@Body() body: any): void {}

  @Post('/body-validation')
  public bodyValidation(
    @Body({
      validationSchema: z.object({
        name: z.string(),
        age: z.number(),
      }),
    })
    body: any,
  ): void {}

  @Get('/query')
  public query(@QueryParam({ name: 'age' }) age: number): void {}

  @Get('/query-validation')
  public queryValidation(
    @QueryParam({
      name: 'age',
      validationSchema: z.number(),
    })
    age: number,
  ): void {}

  @Get('/query-params')
  public queryParams(@QueryParams() query: any): void {}

  @Get('/query-params-validation')
  public queryParamsValidation(
    @QueryParams({
      validationSchema: z.object({
        age: z.number(),
      }),
    })
    query: any,
  ): void {}

  @Get('/:param')
  public param(@Param('param') param: string): void {}

  @Get('/header')
  public header(@Header('x-test') header: string): void {}

  @Get('/headers')
  public headers(@Headers() headers: any): void {}

  @Post('/multipart-form-data')
  public multipartFormData(@MultipartFormData() formData: any): void {}

  @Get('/redirect')
  @Redirect('/redirect')
  public redirect(): void {}

  @Get('/request')
  public request(@Request() request: Request): void {}

  @Get('/response')
  public response(@Response() response: Response): void {}

  @Get('/status')
  @Status(200)
  public status(): void {}

  @Get('/set-header')
  @SetHeader('x-test', 'test')
  public setHeader(): void {}

  @Get('/middleware')
  @Middleware(TestMiddleware, { priority: 1 })
  public middleware(): void {}
}
