import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { type WebsocketService } from '../Services/WebsocketService';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import { registerHandlerArg } from '../Utils/HandlerArgs';
import type { HandlerArg } from '../Utils/HandlerArgs';

type HandlerArgOptions = Omit<HandlerArg, 'idx'>;

/**
 * A decorator class for websocket handler parameters.
 *
 * This class extends the BaseDecorator and registers what a parameter of a
 * `@Message()`, `@OnBinary()`, `@OnOpen()`, `@OnClose()` or `@OnError()`
 * handler receives.
 *
 * @extends {BaseDecorator<HandlerArgOptions>}
 */
class HandlerArgDecorator extends BaseDecorator<HandlerArgOptions> {
  @InjectOptional($WebsocketService)
  private gWebsocketService!: WebsocketService;

  public override created(): void {
    const service = this.gWebsocketService;

    registerHandlerArg(
      this.prototype,
      this.instance,
      this.propertyName,
      { ...this.options, idx: this.propertyIndex },
      (peer) => service?.getParams(peer) ?? {},
    );
  }
}

/**
 * Injects the peer the handler runs for.
 *
 * @example
 * ```ts
 * @OnBinary()
 * public onUpdate(@Data() update: Uint8Array, @Peer() peer: WSPeer) {}
 * ```
 *
 * @returns {Function} - The decorator function.
 */
export function Peer(): Function {
  return createDecorator<HandlerArgOptions, HandlerArgDecorator>(HandlerArgDecorator, { kind: 'peer' });
}

/**
 * Injects the data of the call: the message for `@Message()` and
 * `@OnBinary()`, the close details for `@OnClose()` and the error for
 * `@OnError()`.
 *
 * @returns {Function} - The decorator function.
 */
export function Data(): Function {
  return createDecorator<HandlerArgOptions, HandlerArgDecorator>(HandlerArgDecorator, { kind: 'data' });
}

/**
 * Injects a parameter of a parametric namespace, such as `boardId` of
 * `@Namespace('/ws/boards/:boardId')`. The value is decoded, and its case is
 * kept.
 *
 * @param {string} name - The parameter name, as written in the namespace.
 * @returns {Function} - The decorator function.
 */
export function NamespaceParam(name: string): Function {
  return createDecorator<HandlerArgOptions, HandlerArgDecorator>(HandlerArgDecorator, { kind: 'param', name });
}

/**
 * Injects the context of the peer - what its `@OnConnectionAttempt()` handler
 * returned - or one key of it.
 *
 * @example
 * ```ts
 * @OnConnectionAttempt()
 * public async connect(query: Record<string, unknown>) {
 *   return { user: await this.users.fromToken(query.token) };
 * }
 *
 * @Message({ event: 'rename' })
 * public rename(@Data() data: { name: string }, @PeerContext('user') user: User) {}
 * ```
 *
 * @param {string} [key] - A key of the context; the whole context when omitted.
 * @returns {Function} - The decorator function.
 */
export function PeerContext(key?: string): Function {
  return createDecorator<HandlerArgOptions, HandlerArgDecorator>(HandlerArgDecorator, { kind: 'context', name: key });
}
