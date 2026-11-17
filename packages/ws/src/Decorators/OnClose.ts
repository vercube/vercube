import { createDecorator } from '@vercube/di';
import { HandlerDecorator } from '../Common/HandlerDecorator';
import { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * A decorator function for handling a peer of the namespace disconnected.
 *
 * The decorated method is called with `(peer, details)` with `{ code, reason }`, or with what its
 * parameter decorators (`@Peer()`, `@Data()`, `@NamespaceParam()`, `@PeerContext()`) ask for.
 * Runs once the peer has left the namespace and every room it was in.
 *
 * @returns {Function} - The decorator function.
 */
export function OnClose(): Function {
  return createDecorator(HandlerDecorator, { action: WebsocketTypes.HandlerAction.CLOSE, name: 'OnCloseDecorator' });
}
