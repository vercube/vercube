# Logger Providers

Logger providers are responsible for processing and outputting log messages to various destinations. Vercube includes two built-in providers and allows you to create custom providers.

## Built-in Providers

### ConsoleProvider

The `ConsoleProvider` outputs log messages to the console with color-coded levels.

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
      }
    ]
  });
}
```

Features:
- Color-coded log levels
- Configurable timestamp format
- Pretty-printed objects
- Stack trace formatting for errors

### JSONProvider

The `JSONProvider` formats log messages as JSON, making them suitable for log aggregation systems.

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
        provider: JSONProvider,
        logLevel: 'debug'
      }
    ]
  });
}
```

Features:
- Structured JSON output
- Configurable pretty printing
- Timestamp inclusion
- Error serialization

## Creating Custom Providers

To create a custom provider, extend the `LoggerProvider` abstract class:

```typescript
import { LoggerProvider, LoggerTypes } from '@vercube/logger';

class CustomProvider extends LoggerProvider {
  private options: LoggerTypes.ProviderOptions = {};

  initialize(options: LoggerTypes.ProviderOptions): void {
    this.options = options;
    // Initialize your provider
  }

  processMessage(message: LoggerTypes.LogMessage): void {
    // Process and output the log message
    console.log(`[${message.level}] ${message.message}`);
    
    if (message.args.length > 0) {
      console.log('Additional args:', message.args);
    }
  }
}
```

### Provider Interface

```typescript
abstract class LoggerProvider {
  abstract initialize(options: LoggerTypes.ProviderOptions): void;
  abstract processMessage(message: LoggerTypes.LogMessage): void;
}
```

### Log Message Structure

```typescript
interface LogMessage {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  args: any[];
  timestamp: Date;
}
```

## Example: File Provider

Here's an example of a custom provider that writes logs to a file:

```typescript
import { LoggerProvider, LoggerTypes } from '@vercube/logger';
import * as fs from 'fs';
import * as path from 'path';

class FileProvider extends LoggerProvider {
  private fileStream: fs.WriteStream;
  private options: LoggerTypes.ProviderOptions = {
    filename: 'app.log',
    directory: './logs'
  };

  initialize(options: LoggerTypes.ProviderOptions): void {
    this.options = { ...this.options, ...options };
    
    // Ensure log directory exists
    if (!fs.existsSync(this.options.directory)) {
      fs.mkdirSync(this.options.directory, { recursive: true });
    }

    // Create write stream
    const filePath = path.join(this.options.directory, this.options.filename);
    this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  processMessage(message: LoggerTypes.LogMessage): void {
    const logEntry = {
      timestamp: message.timestamp.toISOString(),
      level: message.level,
      message: message.message,
      args: message.args
    };

    this.fileStream.write(JSON.stringify(logEntry) + '\n');
  }
}
```

### Using Custom Providers with DI

```typescript
export function useContainer(container: Container): Container {

  // Bind the logger to the container
  container.bind(Logger, BaseLogger);

  // Configure the logger
  container.get(Logger).configure({
    logLevel: 'info',
    providers: [
      {
        name: 'file',
        provider: FileProvider,
        options: {
          filename: 'app.log',
          directory: './logs'
        }
      }
    ]
  });
}
```

## Best Practices

1. **Error Handling**
   - Handle initialization errors gracefully
   - Implement proper cleanup in case of errors
   - Log provider errors without causing infinite loops

2. **Performance**
   - Use asynchronous operations for I/O
   - Implement buffering for high-volume logging
   - Consider using streams for file output

3. **Configuration**
   - Provide sensible defaults
   - Validate configuration options
   - Document all available options

4. **Testing**
   - Write unit tests for your provider
   - Test different log levels
   - Test error scenarios
   - Test configuration options

5. **Dependency Injection**
   - Bind providers to the DI container
   - Use the container to resolve providers
   - Inject providers into services that need them

## See Also

- [Logger](./logger.md) - The main Logger class
- [Types](./types.md) - Type definitions
- [Advanced Topics](./advanced.md) - Advanced usage patterns 