import { plugin } from 'crossws/server';
import { defineHooks, type Message, type WSError, type Hooks, type Peer } from 'crossws';
import { type ServerPlugin } from 'srvx';

type MessageHandler = (peer: Peer, data: any) => void;

export class WebsocketService {
  private fServerPlugin: ServerPlugin;

  private namespaces: Record<string, Peer[]> = {};
  private eventHandlers: Record<string, Record<string, MessageHandler>> = {};

  public registerNamespace(path: string) {
    console.log('registering namespace');
    if (!this?.namespaces?.[path.toLowerCase()]) {
      this.namespaces[path.toLowerCase()] = [];
    }
  }

  public registerMessageHandler(namespace: string, event: string, handler: MessageHandler) {
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
        await handler(peer, data); // 👈 injects message into handler
      } else {
        console.warn(`[ws] No handler for event "${event}" in namespace "${namespace}"`);
      }
    } catch (error) {
      console.error(`[ws] Failed to process message:`, error);
    }
  }

  public initialize(hooksOpts?: Partial<Hooks>) {
    const hooks = defineHooks({
      upgrade: async (request: Request) => {
        if (hooksOpts?.upgrade) {
          return await hooksOpts.upgrade(request);
        } else {
          const namespace = new URL(request.url).pathname;
          const isNamespaceRegistered = !!this.namespaces?.[namespace?.toLowerCase()] as boolean;

          console.log(`[ws] upgrading ${request.url}...`, namespace);

          if (!isNamespaceRegistered) {
            console.warn(`[ws] namespace "${namespace}" is not registered. Connection rejected.`);
            return new Response("Namespace not registered", { status: 403 });
          }

          return {
            namespace,
            headers: {},
          };
        }
      },
      open: async (peer) => {
        if (hooksOpts?.open) {
          return await hooksOpts.open(peer);
        } else {
          console.log("[ws] open", peer);
          peer.send({ user: "server", message: `Welcome ${peer}!` });
        }
      },
      message: async (peer: Peer, message: Message) => {
        if (hooksOpts?.message) {
          return await hooksOpts.message(peer, message);
        } else {
          await this.handleMessage(peer, message);
          console.log("[ws] message", message);
          if (message.text().includes("ping")) {
            peer.send({ user: "server", message: "pong" });
          } else {
            peer.send({ user: peer.toString(), message: message.toString() });
          }
        }
      },
      close: async (peer: Peer, details: { code?: number; reason?: string; }) => {
        if (hooksOpts?.close) {
          return await hooksOpts.close(peer, details);
        } else {
          console.log("[ws] close", peer, details);
        }
      },
      error: async (peer: Peer, error: WSError) => {
        if (hooksOpts?.error) {
          return await hooksOpts.error(peer, error);
        } else {
          console.log("[ws] error", peer, error);
        }
      }
    })

    const httpPlugin = plugin(hooks);
    this.fServerPlugin = httpPlugin;
  }

  get serverPlugin(): ServerPlugin {
    return this.fServerPlugin;
  }
}