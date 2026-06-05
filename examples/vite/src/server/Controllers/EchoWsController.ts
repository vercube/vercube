import { Controller } from '@vercube/core';
import { Emit, Message, Namespace } from '@vercube/ws';

@Namespace('/echo')
@Controller('/api/echo')
export default class EchoWsController {
  @Message({ event: 'ping' })
  @Emit('pong')
  public onPing(data: unknown): { echo: unknown } {
    return { echo: data };
  }
}
