# Websocket Module

The Websocket module enables you to set up websocket connections, listens to messages, emit/broadcast messages and more. It is super easy to set up and start using it.

## Overview

The Websocket module consists of:

- **Websocket Plugin**: A plugin responsible for enabling websockets on your application
- **Namespace Decorator**: A decorator for registering a namespace
- **OnConnectionAttempt Decorator**: A decorator for accepting or rejecting a websocket connection
- **Message Decorator**: A decorator for listening to messages
- **Emit Decorator**: A decorator for emitting messages
- **Broadcast Decorator**: A decorator for broadcasting messages (including the peer)
- **BroadcastOthers Decorator**: A decorator for broadcasting messages (excluding the peer)

## Key Features

- **Easy Setup**: A few lines of code and boom, it is running
- **Flexible Connection Handler**: You can control whether the user can connect to the namespace or not
- **Decorator-Based API**: Simple and intuitive API using decorators

## Basic Usage

```typescript
// Enable the websocket module
import { type App } from '@vercube/core';
import { WebsocketPlugin } from '@vercube/ws';

/**
 * Setup the application.
 * @param {App} app - The application instance.
 */
export async function setup(app: App): Promise<void> {
  // register plugins
  app.addPlugin(WebsocketPlugin);
}

const app = await createApp({ setup });

// Use in controllers
@Namespace('/foo')
@Controller('/api')
export class DummyController {
  @OnConnectionAttempt()
  public async onConnectionAttempt(params: Record<string, unknown>, request: Request): Promise<boolean> {
    // if this function throws or returns false
    // the connection is rejected
    // this function is optional
    return true;
  }

  @Message({ event: 'data' })
  @Emit()
  public async onMessage(incomingMessage: unknown, peer: { id: string; ip: string; }): Promise<Record<string, string>> {
    // listen to any messages under the "data" event
    // since we are using @Emit(), the response of
    // the function will be emitted back
    return { foo: 'bar' };
  }
}
```

## See Also

- [Websocket Plugin](./websocket-plugin.md) - Documentation of the Websocket Plugin
- [Namespace Decorator](./namespace-decorator.md) - Documentation of the Namespace decorator
- [OnConnectionAttempt Decorator](./on-connection-attempt-decorator.md) - Documentation of the OnConnectionAttempt decorator
- [Message Decorator](./message-decorator.md) - Documentation of the Message decorator
- [Emit Decorator](./emit-decorator.md) - Documentation of the Emit decorator
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator