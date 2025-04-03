# Logger Types

This document details all the type definitions used in the Vercube logging system.

## Core Types

### LogLevel

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

The `LogLevel` type defines the four supported log levels in Vercube:
- `debug`: Detailed debugging information
- `info`: General operational information
- `warn`: Warning messages
- `error`: Error messages

### LogMessage

```typescript
interface LogMessage {
  level: LogLevel;
  message: string;
  args: any[];
  timestamp: Date;
}
```

The `LogMessage` interface represents a log message with:
- `level`: The log level of the message
- `message`: The main message text
- `args`: Additional arguments passed to the log method
- `timestamp`: When the message was created

## Configuration Types

### LoggerOptions

```typescript
interface LoggerOptions {
  logLevel?: LogLevel;
  providers?: ProviderConfig[];
}
```

The `LoggerOptions` interface defines the configuration options for the logger:
- `logLevel`: The global log level (defaults to 'info')
- `providers`: Array of provider configurations

### ProviderConfig

```typescript
interface ProviderConfig {
  name: string;
  provider: new () => LoggerProvider;
  logLevel?: LogLevel;
  options?: ProviderOptions;
}
```

The `ProviderConfig` interface defines how to configure a provider:
- `name`: Unique identifier for the provider
- `provider`: The provider class constructor
- `logLevel`: Provider-specific log level
- `options`: Provider-specific configuration options

### ProviderOptions

```typescript
interface ProviderOptions {
  [key: string]: any;
}
```

The `ProviderOptions` interface is a flexible type that allows providers to define their own configuration options.

## Provider Types

### ConsoleProviderOptions

```typescript
interface ConsoleProviderOptions extends ProviderOptions {
  colors?: boolean;
  timestamp?: boolean;
  timestampFormat?: string;
}
```

Options specific to the ConsoleProvider:
- `colors`: Enable color output (default: true)
- `timestamp`: Include timestamps (default: true)
- `timestampFormat`: Custom timestamp format

### JSONProviderOptions

```typescript
interface JSONProviderOptions extends ProviderOptions {
  pretty?: boolean;
  timestamp?: boolean;
  timestampFormat?: string;
}
```

Options specific to the JSONProvider:
- `pretty`: Pretty print JSON (default: false)
- `timestamp`: Include timestamps (default: true)
- `timestampFormat`: Custom timestamp format

## Utility Types

### LogFunction

```typescript
type LogFunction = (message: string, ...args: any[]) => void;
```

The `LogFunction` type represents a logging function that takes a message and optional arguments.

### ProviderConstructor

```typescript
type ProviderConstructor = new () => LoggerProvider;
```

The `ProviderConstructor` type represents a constructor for a LoggerProvider class.

## Type Usage Examples

### Basic Logger Configuration

```typescript
const options: LoggerOptions = {
  logLevel: 'debug',
  providers: [
    {
      name: 'console',
      provider: ConsoleProvider,
      logLevel: 'info',
      options: {
        colors: true,
        timestamp: true
      }
    }
  ]
};
```

### Custom Provider Options

```typescript
interface CustomProviderOptions extends ProviderOptions {
  maxFileSize: number;
  rotationInterval: number;
}

class CustomProvider extends LoggerProvider {
  private options: CustomProviderOptions = {
    maxFileSize: 1024 * 1024, // 1MB
    rotationInterval: 24 * 60 * 60 * 1000 // 24 hours
  };
}
```

## Type Safety

The type system ensures:
1. Only valid log levels can be used
2. Provider configurations are properly structured
3. Provider options are type-safe
4. Log messages have the required properties

## See Also

- [Logger](./logger.md) - The main Logger class
- [Providers](./providers.md) - Available log providers
- [Advanced Topics](./advanced.md) - Advanced usage patterns 