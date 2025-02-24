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

  export type LogProviderOptions<T extends IOC.Newable<LoggerProvider>> = Parameters<InstanceType<T>['initialize']>[0] & {
    logLevel?: Level;
  }

  export interface LogAppender<T extends IOC.Newable<LoggerProvider>> {
    name: string;
    provider: T;
    logLevel?: Level;
    options?: LogProviderOptions<T>;
  }

  export interface Options {
    logLevel?: Level;
    providers?: LogAppender<any>[];
  }

}