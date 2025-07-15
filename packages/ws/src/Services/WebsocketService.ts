import { plugin } from 'crossws/server';
import { defineHooks, type Message, type WSError, type Peer } from 'crossws';
import { type ServerPlugin } from 'srvx';
import { WebsocketTypes } from '../Types/WebsocketTypes';

export class WebsocketService {
  private fServerPlugin: ServerPlugin;
  private namespaces: Record<string, Peer[]> = {};
  private eventHandlers: Record<string, Record<string, WebsocketTypes.MessageHandler>> = {};

  public registerNamespace(path: string) {
    if (!this?.namespaces?.[path.toLowerCase()]) {
      this.namespaces[path.toLowerCase()] = [];
    }
  }

  public registerMessageHandler(namespace: string, event: string, handler: WebsocketTypes.MessageHandler) {
    const lowerNamespace = namespace.toLowerCase();
    if (!this.eventHandlers[lowerNamespace]) {
      this.eventHandlers[lowerNamespace] = {};
    }
    this.eventHandlers[lowerNamespace][event] = handler;
    this.registerNamespace(lowerNamespace);
  }

  private async handleMessage(peer: Peer, rawMessage: Message) {
    try {
      const msg = JSON.parse(rawMessage.text());
      const namespace = peer.namespace?.toLowerCase();
      const event = msg.event;
      const data = msg.data;

      const handler = this.eventHandlers?.[namespace]?.[event];
      if (handler) {
        await handler(peer, data);
      } else {
        console.warn(`[WS] No handler for event "${event}" in namespace "${namespace}"`);
      }
    } catch (error) {
      console.error(`[WS] Failed to process message:`, error);
    }
  }

  public broadcast(peer: Peer, message: unknown): void {
    const namespace = peer.namespace?.toLowerCase();
    if (!namespace) return;

    const peers = this.namespaces[namespace];
    if (!peers || peers.length === 0) return;

    for (const p of peers) {
      p.send(message);
    }
  }

  public broadcastOthers(peer: Peer, message: unknown): void {
    const namespace = peer.namespace?.toLowerCase();
    if (!namespace) return;

    const peers = this.namespaces[namespace];
    if (!peers || peers.length === 0) return;

    for (const p of peers) {
      if (p.id !== peer.id) {
        p.send(message);
      }
    }
  }

  public initialize() {
    const hooks = defineHooks({
      upgrade: async (request: Request) => {
        const namespace = new URL(request.url).pathname;
        const isNamespaceRegistered = !!this.namespaces?.[namespace?.toLowerCase()] as boolean;

        if (!isNamespaceRegistered) {
          console.warn(`[WS] Namespace "${namespace}" is not registered. Connection rejected.`);
          return new Response("Namespace not registered", { status: 403 });
        }

        return {
          namespace,
          headers: {},
        };
      },
      open: async (peer) => {
        const namespace = peer.namespace?.toLowerCase();
        if (namespace && this.namespaces[namespace]) {
          this.namespaces[namespace].push(peer);
        }
      },
      message: async (peer: Peer, message: Message) => {
        await this.handleMessage(peer, message);
      },
      close: async (peer: Peer, details: { code?: number; reason?: string; }) => {
        const namespace = peer.namespace?.toLowerCase();
        if (namespace && this.namespaces[namespace]) {
          const peers = this.namespaces[namespace];
          this.namespaces[namespace] = peers.filter(p => p.id !== peer.id);
        }
      },
      error: async (peer: Peer, error: WSError) => {
        console.error('[WS] Error', peer, error);
      }
    });

    this.fServerPlugin = plugin(hooks);
  }

  get serverPlugin(): ServerPlugin {
    return this.fServerPlugin;
  }
}