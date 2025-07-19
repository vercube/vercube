import { type ValidationTypes } from "@vercube/core";

export namespace WebsocketTypes {
  export type MessageHandler = {
    fn: Function;
    schema?: ValidationTypes.Schema;
  }
}