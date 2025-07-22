import { plugin } from 'crossws/server';
import { defineHooks, type Message, type WSError, type Peer } from 'crossws';
import { BadRequestError, HttpServer, ValidationProvider } from '@vercube/core';
import { Inject, InjectOptional } from '@vercube/di';
import { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * WebsocketService class responsible for dealing with
 * Websocket connections.
 * 
 * This class is responsible for:
 * - Registering namespaces and accepting websocket connections for them
 * - Registering event handlers and handling them
 */
export class WebsocketService {

  /**
  * Http Server for injecting the server plugin
  */
  @Inject(HttpServer)
  private gHttpServer: HttpServer;

  /**
  * Validation provider for running the schema validation
  */
  @InjectOptional(ValidationProvider)
  private gValidationProvider: ValidationProvider | null;

  /**
  * Internal namespace registry
  */
  private namespaces: Record<string, Peer[]> = {};

  /**
  * Internal handlers registry
  */
  private handlers: {
    [WebsocketTypes.HandlerAction.CONNECTION]: Record<string, WebsocketTypes.HandlerAttributes>;
    [WebsocketTypes.HandlerAction.MESSAGE]: Record<string, Record<string, WebsocketTypes.HandlerAttributes>>;
  } = {
      [WebsocketTypes.HandlerAction.CONNECTION]: {},  // namespace -> handler
      [WebsocketTypes.HandlerAction.MESSAGE]: {},     // namespace -> event -> handler
    };

  /**
  * Register a new namespace
  */
  public registerNamespace(path: string) {
    if (!this?.namespaces?.[path.toLowerCase()]) {
      this.namespaces[path.toLowerCase()] = [];
    }
  }

  /**
  * Register a new handler
  */
  public registerHandler(
    action: WebsocketTypes.HandlerAction,
    namespace: string,
    handler: WebsocketTypes.HandlerAttributes
  ) {
    const normalizedNamespace = namespace.toLowerCase();

    if (action === WebsocketTypes.HandlerAction.CONNECTION) {
      this.handlers[action][normalizedNamespace] = handler;
    }

    if (action === WebsocketTypes.HandlerAction.MESSAGE) {
      const event = handler.event;
      if (!event) {
        console.warn(`WebsocketService::Cannot register message handler without an event name for namespace "${normalizedNamespace}".`);
        return;
      }

      if (!this.handlers[action][normalizedNamespace]) {
        this.handlers[action][normalizedNamespace] = {};
      }

      this.handlers[action][normalizedNamespace][event] = handler;
    }

    this.registerNamespace(normalizedNamespace);
  }

  private async handleMessage(peer: Peer, rawMessage: Message) {
    try {
      const msg = JSON.parse(rawMessage.text());
      const namespace = peer.namespace?.toLowerCase();
      const event = msg.event;
      const data = msg.data;

      const handler = this.handlers[WebsocketTypes.HandlerAction.MESSAGE]?.[namespace]?.[event];

      if (!handler) {
        console.warn(`[WS] No message handler for event "${event}" in namespace "${namespace}"`);
        return;
      }

      if (handler.schema) {
        if (!this.gValidationProvider) {
          console.warn('WebsocketService::ValidationProvider is not registered');
          return;
        }

        const result = await this.gValidationProvider.validate(handler.schema, data);

        if (result?.issues?.length) {
          throw new BadRequestError('Websocket message validation error', result.issues);
        }
      }

      await handler.callback(data, peer);
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

  public emit(peer: Peer, message: unknown): void {
    peer.send(message);
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
        const url = new URL(request.url);
        const namespace = url.pathname;
        const parameters = Object.fromEntries(url.searchParams.entries());
        const isNamespaceRegistered = !!this.namespaces?.[namespace?.toLowerCase()] as boolean;

        if (!isNamespaceRegistered) {
          console.warn(`[WS] Namespace "${namespace}" is not registered. Connection rejected.`);
          return new Response("Namespace not registered", { status: 403 });
        }

        const handler = this.handlers[WebsocketTypes.HandlerAction.CONNECTION]?.[namespace];

        if (handler) {
          try {
            const result = await handler.callback(parameters, request);

            if (result === false) {
              return new Response("Unauthorized", { status: 403 });
            }
          } catch (error) {
            if (error instanceof Error) {
              return new Response(error.message, { status: 403 });
            }

            return new Response("Unknown error", { status: 403 });
          }
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

    const serverPlugin = plugin(hooks);
    this.gHttpServer.addPlugin(serverPlugin);
  }
}