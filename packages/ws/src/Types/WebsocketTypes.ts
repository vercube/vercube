import { type ValidationTypes } from '@vercube/core';
import { type Message, type Peer, type WSError } from 'crossws';

// re-export the Peer type from crossws
export { type Peer as WSPeer, type Message as WSMessage, type WSError };

export namespace WebsocketTypes {
  export enum HandlerAction {
    CONNECTION = 'connection',
    MESSAGE = 'message',
  }

  export type HandlerAttributes = {
    callback: Function;
    event?: string; // message event to listen to
    schema?: ValidationTypes.Schema;
  };
}
