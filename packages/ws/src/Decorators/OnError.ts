import { createDecorator } from '@vercube/di';
import { HandlerDecorator } from '../Common/HandlerDecorator';
import { WebsocketTypes } from '../Types/WebsocketTypes';

/**
 * A decorator function for handling a peer of the namespace failed.
 *
 * The decorated method is called with `(peer, error)`, or with what its
 * parameter decorators (`@Peer()`, `@Data()`, `@NamespaceParam()`, `@PeerContext()`) ask for.
 * Runs after the service has logged the error.
 *
 * @returns {Function} - The decorator function.
 */
export function OnError(): Function {
  return createDecorator(HandlerDecorator, { action: WebsocketTypes.HandlerAction.ERROR, name: 'OnErrorDecorator' });
}
