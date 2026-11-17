import { createDecorator } from '@vercube/di';
import { HandlerDecorator } from '../Common/HandlerDecorator';
import { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * A decorator function for handling a peer connected to the namespace.
 *
 * The decorated method is called with `(peer)`, or with what its
 * parameter decorators (`@Peer()`, `@Data()`, `@NamespaceParam()`, `@PeerContext()`) ask for.
 * Runs once the connection is open and the peer is counted in the namespace. Messages of the peer wait until it resolves, so it may load state or join rooms first.
 *
 * @returns {Function} - The decorator function.
 */
export function OnOpen(): Function {
  return createDecorator(HandlerDecorator, { action: WebsocketTypes.HandlerAction.OPEN, name: 'OnOpenDecorator' });
}
