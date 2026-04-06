import { Controller, Get } from '@vercube/core';

@Controller('/_health')
export class HealthController {
  @Get('/')
  public index(): { status: string; source: string } {
    return { status: 'ok', source: 'HealthPlugin' };
  }
}
