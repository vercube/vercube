import { Body, Controller, Get, Param, Post, QueryParams } from '@vercube/core';

/**
 * Minimal controller used only for throughput benchmarks.
 * Mirrors the routes used by the Elysia/Hono/Fastify comparison suites.
 */
@Controller('')
export class BenchController {
  @Get('/')
  public index(): { hello: string } {
    return { hello: 'world' };
  }

  @Get('/id/:id')
  public byId(@Param('id') id: string): { id: string } {
    return { id };
  }

  @Get('/query')
  public query(@QueryParams() query: Record<string, string>): Record<string, string> {
    return query;
  }

  @Post('/json')
  public json(@Body() body: unknown): unknown {
    return body;
  }
}
