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

  /**
   * Decides which browser origins may open a websocket.
   *
   * - `string[]`: exact origins such as `https://app.example.com`
   * - `'*'`: any origin (turns the check off)
   * - a function: custom decision for each origin
   */
  export type AllowedOrigins = string[] | '*' | ((origin: string, request: Request) => boolean | Promise<boolean>);

  /**
   * Options accepted by `WebsocketPlugin`.
   */
  export interface Options {
    /**
     * Origins allowed to open a websocket. Requests without an `Origin` header
     * (non-browser clients) are always accepted. When omitted, only same-origin
     * browser requests are accepted: the `Origin` host must match the `Host`
     * (or `X-Forwarded-Host`) header of the upgrade request.
     */
    allowedOrigins?: AllowedOrigins;
  }
}
