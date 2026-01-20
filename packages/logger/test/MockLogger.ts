/* eslint-disable @typescript-eslint/no-unused-vars */
import { Logger } from '../src/Common/Logger';
import type { LoggerTypes } from '../src/Types/LoggerTypes';

export class MockLogger extends Logger {
  public configure(options: LoggerTypes.Options): void {
    // Mock implementation
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
}
