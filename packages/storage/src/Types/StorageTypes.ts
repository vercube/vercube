/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { IOC } from '@vercube/di';
import { Storage } from '../Service/Storage';

export namespace StorageTypes {

  export interface BaseOptions {
    storage?: string;
  }

  export interface Mount {
    name?: string;
    storage: IOC.Newable<Storage>;
  }

  export interface GetItem extends BaseOptions {
    key: string;
  }

  export interface SetItem<T = unknown> extends BaseOptions {
    key: string;
    value: T;
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