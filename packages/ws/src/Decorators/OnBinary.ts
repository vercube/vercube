import { createDecorator } from '@vercube/di';
import { HandlerDecorator } from '../Common/HandlerDecorator';
import { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * A decorator function for handling a binary frame on the namespace.
 *
 * The decorated method is called with `(data, peer)` with `data` a `Uint8Array`, or with what its
 * parameter decorators (`@Peer()`, `@Data()`, `@NamespaceParam()`, `@PeerContext()`) ask for.
 * Binary frames go to this handler instead of being parsed as `{ event, data }` JSON; text frames still go to `@Message()` handlers.
 *
 * @returns {Function} - The decorator function.
 */
export function OnBinary(): Function {
  return createDecorator(HandlerDecorator, { action: WebsocketTypes.HandlerAction.BINARY, name: 'OnBinaryDecorator' });
}
