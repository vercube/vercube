import { Body, Controller, Post, Request, Sse } from '@vercube/core';
import { Inject } from '@vercube/di';
import { EventsService } from '../Services/EventsService';
import type { AppEvent } from '../Services/EventsService';
import type { SseMessage } from '@vercube/core';

/**
 * Server-Sent Events with the `@Sse()` decorator.
 *
 * Listen:  curl -N http://localhost:3001/api/events
 * Publish: curl -X POST http://localhost:3001/api/events -H 'Content-Type: application/json' -d '{"type":"hello","payload":1}'
 */
@Controller('/api/events')
export class EventsController {
  @Inject(EventsService)
  private readonly gEvents!: EventsService;

  @Sse('/', { heartbeat: 15_000 })
  public async *stream(@Request() req: Request): AsyncGenerator<SseMessage> {
    // The response starts with the first message, so send one right away.
    yield { retry: 3000 };

    for await (const event of this.gEvents.subscribe(req.signal)) {
      yield { event: event.type, data: event };
    }
  }

  @Post('/')
  public publish(@Body() event: AppEvent): { ok: true } {
    this.gEvents.publish(event);
    return { ok: true };
  }
}
