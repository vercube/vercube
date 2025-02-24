import type { IOC } from '@vercube/di';
import type { LoggerProvider } from '../Common/LoggerProvider';

export namespace LoggerTypes {

  export type Level = 'debug' | 'info' | 'warn' | 'error';

  export type Arg = any;

  export interface Message {
    level: Level;
    tag: string;
    args: Arg[];
    pid?: number;
    type?: 'access_log' | 'application_log';
    timestamp?: number;
  }


  export interface LogAppender<T extends IOC.Newable<LoggerProvider>> {
    name: string;
    provider: T;
    options?: Parameters<InstanceType<T>['initialize']>[0];
  }

  export interface Options {
    logLevel?: Level;
    providers?: LogAppender<any>[];
  }

}