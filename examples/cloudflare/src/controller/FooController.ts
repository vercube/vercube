import { Controller, Get } from '@vercube/core';
import { Inject } from '@vercube/di';
import { CloudflareBindings } from '@vercube/serverless/cloudflare';

interface Env {
  GREETING: string;
}

/**
 * A controller that reads a Cloudflare binding.
 */
@Controller('/api/foo')
export default class FooController {
  @Inject(CloudflareBindings)
  private readonly gCloudflare!: CloudflareBindings<Env>;

  /**
   * Handles GET requests to the / endpoint.
   * @returns {Promise<{ message: string }>} A greeting taken from the `GREETING` variable of `wrangler.jsonc`.
   */
  @Get('/')
  public async index(): Promise<{ message: string }> {
    return { message: this.gCloudflare.env.GREETING };
  }
}
