import { type Message, type Peer, type WSError, defineHooks } from 'crossws';
import { plugin } from 'crossws/server';
import { BadRequestError, HttpServer, ValidationProvider } from '@vercube/core';
import { Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * WebsocketService class responsible for dealing with Websocket connections.
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
  private readonly gHttpServer: HttpServer;

  /**
   * Validation provider for running the schema validation
   */
  @InjectOptional(ValidationProvider)
  private readonly gValidationProvider: ValidationProvider | null;

  @InjectOptional(Logger)
  private readonly gLogger: Logger | null;

  /**
   * Internal namespace registry
   */
  private fNamespaces: Record<string, Peer[]> = {};

  /**
   * Internal handlers registry
   */
  private fHandlers: {
    [WebsocketTypes.HandlerAction.CONNECTION]: Record<string, WebsocketTypes.HandlerAttributes>;
    [WebsocketTypes.HandlerAction.MESSAGE]: Record<string, Record<string, WebsocketTypes.HandlerAttributes>>;
  } = {
    [WebsocketTypes.HandlerAction.CONNECTION]: {}, // namespace -> handler
    [WebsocketTypes.HandlerAction.MESSAGE]: {}, // namespace -> event -> handler
  };

  /**
   * Register a new namespace.
   *
   * @param {string} path - The namespace path to register.
   * @returns {void}
   */
  public registerNamespace(path: string): void {
    if (!this?.fNamespaces?.[path.toLowerCase()]) {
      this.fNamespaces[path.toLowerCase()] = [];
    }
  }

  /**
   * Register a new handler for a namespace or event.
   *
   * @param {WebsocketTypes.HandlerAction} action - The handler action type.
   * @param {string} namespace - The namespace to register the handler for.
   * @param {WebsocketTypes.HandlerAttributes} handler - The handler attributes.
   * @returns {void}
   */
  public registerHandler(
    action: WebsocketTypes.HandlerAction,
    namespace: string,
    handler: WebsocketTypes.HandlerAttributes,
  ): void {
    const normalizedNamespace = namespace.toLowerCase();

    if (action === WebsocketTypes.HandlerAction.CONNECTION) {
      this.fHandlers[action][normalizedNamespace] = handler;
    }

    if (action === WebsocketTypes.HandlerAction.MESSAGE) {
      const event = handler.event;
      if (!event) {
        this.gLogger?.warn(
          'WebsocketService::registerHandler',
          `Cannot register message handler without an event name for namespace "${normalizedNamespace}".`,
        );
        return;
      }

      if (!this.fHandlers[action][normalizedNamespace]) {
        this.fHandlers[action][normalizedNamespace] = {};
      }

      this.fHandlers[action][normalizedNamespace][event] = handler;
    }

    this.registerNamespace(normalizedNamespace);
  }

  /**
   * Broadcast a message to all peers in the same namespace (including the sender).
   *
   * @param {Peer} peer - The sender peer (used to determine the namespace).
   * @param {unknown} message - The message to broadcast.
   * @returns {void}
   */
  public broadcast(peer: Peer, message: unknown): void {
    const namespace = peer.namespace?.toLowerCase();
    if (!namespace) return;

    const peers = this.fNamespaces[namespace];
    if (!peers || peers.length === 0) return;

    for (const p of peers) {
      p.send(message);
    }
  }

  /**
   * Emit a message to a single peer.
   *
   * @param {Peer} peer - The peer to send the message to.
   * @param {unknown} message - The message to send.
   * @returns {void}
   */
  public emit(peer: Peer, message: unknown): void {
    peer.send(message);
  }

  /**
   * Broadcast a message to all peers in the same namespace except the sender.
   *
   * @param {Peer} peer - The sender peer (used to determine the namespace).
   * @param {unknown} message - The message to broadcast.
   * @returns {void}
   */
  public broadcastOthers(peer: Peer, message: unknown): void {
    const namespace = peer.namespace?.toLowerCase();
    if (!namespace) return;

    const peers = this.fNamespaces[namespace];
    if (!peers || peers.length === 0) return;

    for (const p of peers) {
      if (p.id !== peer.id) {
        p.send(message);
      }
    }
  }

  /**
   * Initialize the websocket service and attach the server plugin.
   *
   * @returns {void}
   */
  public initialize(): void {
    const hooks = defineHooks({
      upgrade: async (request: Request) => {
        const url = new URL(request.url);
        const namespace = url.pathname;
        const parameters = Object.fromEntries(url.searchParams.entries());
        const isNamespaceRegistered = !!this.fNamespaces?.[namespace?.toLowerCase()] as boolean;

        if (!isNamespaceRegistered) {
          this.gLogger?.warn('WebsocketService::initialize', `Namespace "${namespace}" is not registered. Connection rejected.`);
          return new Response('Namespace not registered', { status: 403 });
        }

        const handler = this.fHandlers[WebsocketTypes.HandlerAction.CONNECTION]?.[namespace];

        if (handler) {
          try {
            const result = await handler.callback(parameters, request);

            if (result === false) {
              return new Response('Unauthorized', { status: 403 });
            }
          } catch (error) {
            if (error instanceof Error) {
              return new Response(error.message, { status: 403 });
            }

            return new Response('Unknown error', { status: 403 });
          }
        }

        return {
          namespace,
          headers: {},
        };
      },
      open: async (peer) => {
        const namespace = peer.namespace?.toLowerCase();
        if (namespace && this.fNamespaces[namespace]) {
          this.fNamespaces[namespace].push(peer);
        }
      },
      message: async (peer: Peer, message: Message) => {
        await this.handleMessage(peer, message);
      },
      close: async (peer: Peer) => {
        const namespace = peer.namespace?.toLowerCase();
        if (namespace && this.fNamespaces[namespace]) {
          const peers = this.fNamespaces[namespace];
          this.fNamespaces[namespace] = peers.filter((p) => p.id !== peer.id);
        }
      },
      error: async (peer: Peer, error: WSError) => {
        this.gLogger?.error('WebsocketService::initialize', `Error: ${error.message}`, {
          peer,
        });
      },
    });

    const serverPlugin = plugin(hooks);
    this.gHttpServer.addPlugin(serverPlugin);
  }

  /**
   * Handle an incoming websocket message for a peer.
   *
   * @param {Peer} peer - The peer receiving the message.
   * @param {Message} rawMessage - The raw websocket message.
   * @returns {Promise<void>}
   */
  private async handleMessage(peer: Peer, rawMessage: Message): Promise<void> {
    try {
      const msg = JSON.parse(rawMessage.text());
      const namespace = peer.namespace?.toLowerCase();
      const event = msg.event;
      const data = msg.data;

      const handler = this.fHandlers[WebsocketTypes.HandlerAction.MESSAGE]?.[namespace]?.[event];

      if (!handler) {
        this.gLogger?.warn(
          'WebsocketService::handleMessage',
          `No message handler for event "${event}" in namespace "${namespace}"`,
        );
        return;
      }

      if (handler.schema) {
        if (!this.gValidationProvider) {
          this.gLogger?.warn('WebsocketService::handleMessage', 'ValidationProvider is not registered');
          return;
        }

        const result = await this.gValidationProvider.validate(handler.schema, data);

        if (result?.issues?.length) {
          throw new BadRequestError('Websocket message validation error', result.issues);
        }
      }

      await handler.callback(data, peer);
    } catch (error) {
      this.gLogger?.error('WebsocketService::handleMessage', `Failed to process message: ${error}`);
    }
  }
}
