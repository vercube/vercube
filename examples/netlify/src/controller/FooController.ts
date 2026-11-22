import { Controller, Get } from '@vercube/core';
import { Inject } from '@vercube/di';
import { NetlifyContext } from '@vercube/serverless/netlify';
import type { Context } from '@netlify/functions';

/**
 * A controller that reads the Netlify context of the request.
 */
@Controller('/api/foo')
export default class FooController {
  @Inject(NetlifyContext)
  private readonly gNetlify!: NetlifyContext<Context>;

  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string; country: string | null }>} A greeting, and the country Netlify located the visitor in.
   */
  @Get('/')
  public async index(): Promise<{ message: string; country: string | null }> {
    return { message: 'Hello, world!', country: this.gNetlify.context.geo?.country?.code ?? null };
  }
}
