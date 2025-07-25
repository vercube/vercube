import { type ValidationTypes } from "@vercube/core";

export namespace WebsocketTypes {

  export enum HandlerAction {
    CONNECTION = 'connection',
    MESSAGE = 'message'
  }

  export type HandlerAttributes = {
    callback: Function;
    event?: string; // message event to listen to
    schema?: ValidationTypes.Schema;
  }
  
}