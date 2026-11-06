import { Controller, Sse } from '@vercube/core';

@Controller('/api/clock')
export class ClockController {
  /** Sends the time once a second, five times. */
  @Sse('/')
  public async *ticks(): AsyncGenerator<{ event: 'tick'; data: { at: string } } | { event: 'done' }> {
    for (let i = 0; i < 5; i++) {
      yield { event: 'tick', data: { at: new Date().toISOString() } };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    yield { event: 'done' };
  }
}
