import { type RouterMethod, type EventHandler } from 'h3';

export namespace RouterTypes {

  export interface Route {
    path: string;
    method: RouterMethod;
    handler: EventHandler;
  }

}