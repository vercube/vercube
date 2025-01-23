 
export namespace HooksTypes {

  export interface HookType<T> {
    new(): T;
  }

  export type HookData<T> = {
    [P in keyof T]: T[P];
  };

  export interface HookCallback<T> {
    (data: T): void | Promise<void>;
  }

  export interface HookHandler<T> {
    id: number;
    callback: HookCallback<T>;
  }

  // holds id of event
  export interface HookID {
    readonly __id: number;
    readonly __type: HookType<any>;
  }

  }