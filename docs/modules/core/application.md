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
  server: {
    port: 3000,
    host: 'localhost'
  }
});
```

## Application Options

The `createApp` function accepts the [`ConfigTypes.Config`](/config/#config-options)