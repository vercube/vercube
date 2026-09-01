/* eslint-disable @typescript-eslint/no-unused-vars */
import { Logger } from '../src/Common/Logger';
import type { LoggerTypes } from '../src/Types/LoggerTypes';
import type { EvlogPlugin } from 'evlog';

export class MockLogger extends Logger {
  public configure(options: LoggerTypes.Options): void {
    // Mock implementation
  }

  public addPlugin(plugin: EvlogPlugin): void {
    // Mock implementation
  }

  public addDrain(name: string, drain: NonNullable<EvlogPlugin['drain']>): void {
    // Mock implementation
  }

  public addEnricher(name: string, enrich: NonNullable<EvlogPlugin['enrich']>): void {
    // Mock implementation
  }

  public addContextProvider(provider: LoggerTypes.ContextProvider): () => void {
    return () => {
      // Mock implementation
    };
  }

  public debug(...args: LoggerTypes.Arg[]): void {
    // Mock implementation
  }

  public info(...args: LoggerTypes.Arg[]): void {
    // Mock implementation
  }

  public warn(...args: LoggerTypes.Arg[]): void {
    // Mock implementation
  }

  public error(...args: LoggerTypes.Arg[]): void {
    // Mock implementation
  }

  public set(context: LoggerTypes.Context): void {
    // Mock implementation
  }

  public getContext(): LoggerTypes.Context {
    return {};
  }

  public child(context: LoggerTypes.Context): Logger {
    return this;
  }

  public emit(overrides?: LoggerTypes.Context): void {
    // Mock implementation
  }
}
