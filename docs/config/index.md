# Configuration

When running a Vercube application, you can configure various aspects of your application using a configuration object. This page documents all available configuration options.

## Config File

The most basic config file looks like this:

```ts
import { defineConfig } from '@vercube/core'

export default defineConfig({
  // config options
})
```

Attempting to read or modify other configuration properties during runtime will result in an error.

## Config Options

### Production Mode

```ts
{
  production?: boolean
}
```

Flag indicating if the application is running in production mode. When set to `true`, enables production optimizations.

### Development Mode

```ts
{
  dev?: boolean
}
```

Flag indicating if the application is running in development mode. When set to `true`, enables development features like hot module replacement.

### Log Level

```ts
{
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace'
}
```

Controls the verbosity of logging output. Defaults to `'info'` in production and `'debug'` in development.

### Server Options

```ts
{
  server?: {
    runtime?: 'node' | 'bun' | 'deno'
    host?: string
    port?: number
    https?: false | {
      key: string
      cert: string
    }
    static?: {
      dirs: string[]
      maxAge?: number
      immutable?: boolean
      etag?: boolean
    }
  }
}
```

#### Runtime

Specifies the JavaScript runtime environment for the server. Supported values:
- `'node'` - Node.js runtime
- `'bun'` - Bun runtime
- `'deno'` - Deno runtime

#### Host

The hostname to bind the server to. Defaults to `'localhost'`.

#### Port

The port number to listen on. Defaults to `3000`.

#### HTTPS

Configuration for HTTPS server. When set to `false`, server runs in HTTP mode. When enabled, requires:
- `key`: Path to SSL key file
- `cert`: Path to SSL certificate file

#### Static

Configuration for serving static files:
- `dirs`: Array of directories to serve static files from
- `maxAge`: Cache duration in seconds
- `immutable`: Whether to mark files as immutable
- `etag`: Whether to enable ETag support

### Runtime Configuration
::: warning IMPORTANT
Only the `runtime` configuration property is available to be read and modified during application execution. All other configuration properties are read-only and can only be set during application initialization.
:::

```ts
{
  runtime?: {
    session?: {
      secret?: string
      name?: string
      duration?: number
    }
  }
}
```

#### Session

Configuration for session management:
- `secret`: Secret used to sign session ID cookie
- `name`: Name of the session ID cookie
- `duration`: Session duration in milliseconds

### Build Options

```ts
{
  build?: {
    root?: string
    entry?: string
    output?: {
      dir?: string
      publicDir?: string
    }
    bundler?: 'rolldown'
  }
}
```

#### Root

The root directory for the application build.

#### Entry

The entry point file for the application build.

#### Output

Build output configuration:
- `dir`: Main output directory for build artifacts
- `publicDir`: Directory for public/client-side build artifacts

#### Bundler

The bundler to use for the application build. Currently supports:
- `'rolldown'` - Rolldown bundler

### Experimental Options

```ts
{
  experimental?: {
    // Experimental features configuration
  }
}
```

Configuration for experimental features. These options may change or be removed in future versions.

## Type Definitions

All configuration types are available from the `@vercube/core` package:

```ts
import type { ConfigTypes } from '@vercube/core'
```

## Environment Variables

You can use environment variables in your configuration. They are loaded from `.env` files in your project root:

```env
VERCUBE_SERVER_PORT=3000
VERCUBE_SERVER_HOST=localhost
VERCUBE_LOG_LEVEL=debug
```

Environment variables are prefixed with `VERCUBE_` to avoid conflicts with other applications.
