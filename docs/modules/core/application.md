# Application

The Application class is the main entry point for a Vercube application. It manages the application lifecycle, including initialization, routing, and listening for incoming requests.

## Overview

The Application class provides the following functionality:

1. **Application Lifecycle** - Managing the application lifecycle, including initialization, startup, and shutdown
2. **Routing** - Defining and handling routes
3. **Middleware** - Adding middleware to the application
4. **Error Handling** - Configuring error handlers
5. **Configuration** - Managing application configuration

## Creating an Application

You can create an application using the `createApp` function:

```typescript
import { createApp } from '@vercube/core';
import { Container } from '@vercube/di';

// Create a container
const container = new Container();

// Create an application
const app = createApp({
  container,
  port: 3000,
  host: 'localhost'
});
```

## Application Options

The `createApp` function accepts the following options:

```typescript
interface AppOptions {
  container: Container;
  port?: number;
  host?: string;
  basePath?: string;
  cors?: boolean | CorsOptions;
  bodyParser?: boolean | BodyParserOptions;
  compression?: boolean | CompressionOptions;
  helmet?: boolean | HelmetOptions;
  static?: boolean | StaticOptions;
  errorHandler?: ErrorHandler;
}
```

- `container` - The dependency injection container (required)
- `port` - The port to listen on (default: 3000)
- `host` - The host to listen on (default: 'localhost')
- `basePath` - The base path for all routes (default: '/')
- `cors` - CORS options (default: true)
- `bodyParser` - Body parser options (default: true)
- `compression` - Compression options (default: true)
- `helmet` - Helmet options (default: true)
- `static` - Static file serving options (default: false)
- `errorHandler` - Global error handler (default: DefaultErrorHandler)

## See Also

- [Decorators](./decorators.md) - Core decorators for defining application components
- [Error Handling](./error-handling.md) - Error handling system
- [Hooks](./hooks.md) - Application lifecycle hooks
