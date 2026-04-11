import { Controller, Get } from '@vercube/core';

/**
 * Simple health-check endpoint.
 * Excluded from evlog request logging via the `exclude` option in vercube.config.ts.
 */
@Controller('/health')
export class HealthController {
  @Get('/')
  public check(): { status: string } {
    return { status: 'ok' };
  }
}
