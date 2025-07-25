# Websocket Plugin

The websocket plugin is responsible for enabling websockets on your application.

## Usage

```typescript
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

// We register the WebsocketPlugin to the app exporting a setup function
// that we pass when calling "createApp"
const app = await createApp({ setup });
```

## See Also

- [Namespace Decorator](./namespace-decorator.md) - Documentation of the Namespace decorator
- [OnConnectionAttempt Decorator](./on-connection-attempt-decorator.md) - Documentation of the OnConnectionAttempt decorator
- [Message Decorator](./message-decorator.md) - Documentation of the Message decorator
- [Emit Decorator](./emit-decorator.md) - Documentation of the Emit decorator
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator