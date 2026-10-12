import { Controller, Get, Param } from '@vercube/core';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../src';
import { testTelemetry } from '../src/Telemetry';

@Controller('/users')
class UserController {
  @Get('/:id')
  public get(@Param('id') id: string): unknown {
    return { id };
  }
}

describe('testTelemetry', () => {
  it('should record a server span per request', async () => {
    const telemetry = testTelemetry();
    const app = await createTestApp({ controllers: [UserController], extensions: [telemetry] });

    await app.get('/users/1').expect(200);
    await telemetry.settle();

    const span = telemetry.span('GET /users/:id');

    expect(span).toBeDefined();
    expect(telemetry.spans().length).toBeGreaterThan(0);

    telemetry.reset();
    expect(telemetry.span('GET /users/:id')).toBeUndefined();

    await app.close();
  });

  it('should shut the providers down on close', async () => {
    const telemetry = testTelemetry();
    const app = await createTestApp({ controllers: [UserController], extensions: [telemetry] });

    const shutdown = vi.spyOn(telemetry.telemetry, 'shutdown');

    await app.close();

    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('should refuse to be read before the app boots', () => {
    expect(() => testTelemetry().spans()).toThrow('not set up yet');
  });
});
