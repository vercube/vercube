import { type Peer } from "crossws";

export namespace WebsocketTypes {
  export type MessageHandler = (peer: Peer, data: any) => Promise<void>;
}