import { defineRecipe } from '../Apply';

const GATEWAY = `import { Inject } from '@vercube/di';
import { $WebsocketService, Emit, Message, Namespace } from '@vercube/ws';
import type { WebsocketService, WSPeer } from '@vercube/ws';

/**
 * ws://localhost:3000/chat, send {"event":"message","data":{"text":"hi"}}
 */
@Namespace('/chat')
export default class ChatGateway {
  @Inject($WebsocketService)
  private gWebsocket!: WebsocketService;

  @Message({ event: 'message' })
  @Emit('message')
  public async onMessage(data: unknown, peer: WSPeer): Promise<{ received: unknown }> {
    this.gWebsocket.broadcast(peer, { event: 'message', data });

    return { received: data };
  }
}
`;

export const websocketsRecipe = defineRecipe({
  id: 'ws',
  label: 'WebSockets',
  hint: 'real-time gateways',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/ws': 'latest' });
    project.addPlugin({ name: 'WebsocketPlugin', from: '@vercube/ws' });
    project.createFile('src/gateways/ChatGateway.ts', GATEWAY);
    project.bind({ name: 'ChatGateway', from: '@/gateways/ChatGateway', default: true });
  },
});
