import { Controller, Get, Middleware } from '../../src';
import { BaseMiddleware } from '../../src/Services/Middleware/BaseMiddleware';
import type { MaybePromise, MiddlewareOptions } from '../../src';

export class TestMiddleware extends BaseMiddleware {
  public override onRequest(req: Request, res: Response, args: MiddlewareOptions<any>): MaybePromise<void | Response> {}

  public override onResponse(req: Request, res: Response, payload: any): MaybePromise<void | Response> {}
}

@Controller('/middleware-global')
@Middleware(TestMiddleware)
export class MiddlewareGlobalController {
  @Get('/')
  public middleware(): void {}
}

@Controller('/middleware')
export class MiddlewareController {
  @Get('/')
  @Middleware(TestMiddleware, { priority: 1 })
  public middleware(): void {}
}

export class ArgsMiddleware extends BaseMiddleware<{ roles: string[] }> {
  public override onRequest(req: Request, res: Response, args: MiddlewareOptions<{ roles: string[] }>): Response {
    return Response.json({ middlewareArgs: args.middlewareArgs ?? null });
  }
}

@Controller('/middleware-args-global')
@Middleware(ArgsMiddleware, { args: { roles: ['user'] } })
export class MiddlewareArgsGlobalController {
  @Get('/')
  public middleware(): void {}
}

@Controller('/middleware-args')
export class MiddlewareArgsController {
  @Get('/')
  @Middleware(ArgsMiddleware, { priority: 1, args: { roles: ['admin'] } })
  public middleware(): void {}

  @Get('/none')
  @Middleware(ArgsMiddleware)
  public none(): void {}
}
