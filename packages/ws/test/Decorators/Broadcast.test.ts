import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, type App, type ConfigTypes } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { $WebsocketService } from '../../src/Symbols/WebsocketSymbols';
import { Broadcast } from '../../src/Decorators/Broadcast';
import { Message } from '../../src/Decorators/Message';
import { Namespace } from '../../src/Decorators/Namespace';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

@Namespace('/broadcast')
class BroadcastTestService {
  @Message({ event: 'echo' })
  @Broadcast('echoed')
  public echoMessage(data: any, peer: any) {
    return { echoed: data };
  }
}

describe('@Broadcast() decorator', () => {
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

    container.bind($WebsocketService, WebsocketService);
    container.bind(BroadcastTestService);

    websocketService = container.get($WebsocketService);

    vi.spyOn(websocketService, 'broadcast').mockImplementation(broadcastSpy);

    initializeContainer(container);
  });

  it('should call broadcast with the result of the method', async () => {
    const peer = { id: 'peer-1', namespace: '/broadcast' };
    const testService = container.get(BroadcastTestService);

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