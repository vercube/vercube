import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, type App, type ConfigTypes } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { WebsocketServiceKey } from '../../src/Utils/WebsocketServiceKey';
import { Emit } from '../../src/Decorators/Emit';
import { Message } from '../../src/Decorators/Message';
import { Namespace } from '../../src/Decorators/Namespace';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

@Namespace('/emit')
class EmitTestService {
  @Message({ event: 'echo' })
  @Emit('echoed')
  public echoMessage(data: any, peer: any) {
    return { echoed: data };
  }
}

describe('@Emit() decorator', () => {
  let container: Container;
  let app: App;
  let websocketService: WebsocketService;
  const broadcastSpy = vi.fn();

  const config: ConfigTypes.Config = {
    logLevel: 'info',
    server: { static: { dirs: ['./public'] } }
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    app = await createApp(config as any);
    container = app.container;

    container.bind(WebsocketServiceKey, WebsocketService);
    container.bind(EmitTestService);

    websocketService = container.get(WebsocketServiceKey);

    vi.spyOn(websocketService, 'emit').mockImplementation(broadcastSpy);

    initializeContainer(container);
  });

  it('should call emit with the result of the method', async () => {
    const peer = { id: 'peer-1', namespace: '/broadcast' };
    const testService = container.get(EmitTestService);

    const message = { text: 'hello' };
    const result = await testService.echoMessage(message, peer);

    expect(result).toEqual({ echoed: message });

    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith(peer, {
      event: 'echoed',
      data: { echoed: message },
    });
  });
});