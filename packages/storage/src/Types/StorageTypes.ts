/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { Storage } from '../Service/Storage';
import type { IOC } from '@vercube/di';

export namespace StorageTypes {
  export interface BaseOptions {
    storage?: string;
  }

  export type Mount<T extends Storage<unknown>> = {
    name?: string;
    storage: IOC.Newable<T>;
  } & (T extends Storage<undefined>
    ? { initOptions?: unknown }
    : T extends Storage<infer U>
    ? { initOptions: U }
    : never);

  export interface Storages<T = unknown> {
    storage: Storage<T>;
    initOptions?: T;
  }

  export interface GetItem extends BaseOptions {
    key: string;
  }

  export interface SetItem<T = unknown, U = unknown> extends BaseOptions {
    key: string;
    value: T;
    options?: U;
  }

  export interface DeleteItem extends BaseOptions {
    key: string;
  }

  export interface HasItem extends BaseOptions {
    key: string;
  }

  export interface GetKeys extends BaseOptions {
  }

  export interface Clear extends BaseOptions {
  }

  export interface Size extends BaseOptions {
  }
}