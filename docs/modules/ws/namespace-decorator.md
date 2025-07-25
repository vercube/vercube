# Namespace Decorator

The namespace decorator is responsible for registering a namespace to work with websockets. A websocket connection will be only accepted if the namespace is registered.

## Usage

```typescript
@Namespace('/foo') // register the namespace
@Controller('/api/playground')
@Middleware(FirstMiddleware)
export default class DummyController {}
```

Now you can connect to websockets using the `/foo` namespace, example:

```typescript
new WebSocket('http://localhost:3001/foo');
```

## See Also

- [Websocket Plugin](./websocket-plugin.md) - Documentation of the Websocket Plugin
- [OnConnectionAttempt Decorator](./on-connection-attempt-decorator.md) - Documentation of the OnConnectionAttempt decorator
- [Message Decorator](./message-decorator.md) - Documentation of the Message decorator
- [Emit Decorator](./emit-decorator.md) - Documentation of the Emit decorator
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator