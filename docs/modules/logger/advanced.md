# Advanced Logger Topics

This document covers advanced usage patterns and techniques for the Vercube logging system.

## Multiple Providers with Different Log Levels

You can configure multiple providers with different log levels to achieve fine-grained control over log output:

```typescript [container.ts]
export function useContainer(container: Container): Container {

  // Bind the logger to the container
  container.bind(Logger, BaseLogger);

  // Configure the logger
  container.get(Logger).configure({
    logLevel: 'info',
    providers: [
      {
        name: 'console',
        provider: ConsoleProvider,
        logLevel: 'debug'
      },
      {
        name: 'json',
        provider: JSONProvider,
        logLevel: 'info',
      }
    ]
  });
}
```

## Custom Log Formatting

Create a custom provider to implement specific log formatting:

```typescript
import { LoggerProvider, LoggerTypes } from '@vercube/logger';

class CustomFormatProvider extends LoggerProvider {
  processMessage(message: LoggerTypes.LogMessage): void {
    const formattedMessage = this.formatMessage(message);
    console.log(formattedMessage);
  }

  private formatMessage(message: LoggerTypes.LogMessage): string {
    const timestamp = message.timestamp.toISOString();
    const level = message.level.toUpperCase();
    const args = message.args.map(arg => 
      arg instanceof Error ? arg.stack : JSON.stringify(arg)
    ).join(' ');

    return `[${timestamp}] ${level}: ${message.message} ${args}`;
  }
}
```

## Asynchronous Logging

Implement asynchronous logging for better performance:

```typescript
import { LoggerProvider, LoggerTypes } from '@vercube/logger';

class AsyncProvider extends LoggerProvider {
  private queue: LoggerTypes.LogMessage[] = [];
  private processing: boolean = false;

  async processMessage(message: LoggerTypes.LogMessage): Promise<void> {
    this.queue.push(message);
    
    if (!this.processing) {
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const message = this.queue.shift();
      if (message) {
        await this.writeLog(message);
      }
    }

    this.processing = false;
  }

  private async writeLog(message: LoggerTypes.LogMessage): Promise<void> {
    // Implement your async writing logic here
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(JSON.stringify(message));
  }
}
```

## Log Aggregation

Create a provider that sends logs to a remote aggregation service:

```typescript
import { LoggerProvider, LoggerTypes } from '@vercube/logger';
import axios from 'axios';

class LogAggregationProvider extends LoggerProvider {
  private endpoint: string;
  private batchSize: number = 100;
  private batch: LoggerTypes.LogMessage[] = [];

  initialize(options: LoggerTypes.ProviderOptions): void {
    this.endpoint = options.endpoint || 'http://logs.example.com';
  }

  async processMessage(message: LoggerTypes.LogMessage): Promise<void> {
    this.batch.push(message);

    if (this.batch.length >= this.batchSize) {
      await this.sendBatch();
    }
  }

  private async sendBatch(): Promise<void> {
    if (this.batch.length === 0) return;

    try {
      await axios.post(this.endpoint, {
        logs: this.batch
      });
      this.batch = [];
    } catch (error) {
      console.error('Failed to send logs:', error);
      // Implement retry logic or fallback storage
    }
  }
}

```

## Best Practices

1. **Performance Optimization**
   - Use asynchronous logging for I/O operations
   - Implement batching for remote logging
   - Use appropriate buffer sizes
   - Consider log rotation for file-based logging

2. **Error Handling**
   - Implement proper error handling in providers
   - Use fallback mechanisms for failed operations
   - Avoid infinite loops in error logging
   - Handle provider initialization failures

3. **Security**
   - Sanitize log messages
   - Avoid logging sensitive information
   - Implement proper access controls
   - Use secure connections for remote logging

4. **Monitoring**
   - Monitor log file sizes
   - Track logging performance
   - Set up alerts for logging failures
   - Monitor disk space usage

5. **Dependency Injection**
   - Always use the DI container to manage logger instances
   - Bind providers to the container
   - Inject the logger into services that need logging
   - Use constructor injection for better testability

## See Also

- [Logger](./logger.md) - The main Logger class
- [Providers](./providers.md) - Available log providers
- [Types](./types.md) - Type definitions 