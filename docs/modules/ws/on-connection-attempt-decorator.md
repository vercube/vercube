# OnConnectionAttempt Decorator

Using the `@OnConnectionAttempt()` decorator, you can control whether a user can connect to a namespace or not. If the function throws or returns false, the connection is rejected. The usage of this decorator is optional.

The parameters that you can receive on the function are: 
```typescript 
(params: Record<string, unknown>, request: Request)
```

## Usage

```typescript
@Namespace('/foo') // register the namespace
@Controller('/api/playground')
@Middleware(FirstMiddleware)
export default class DummyController {
  @OnConnectionAttempt()
  public async onConnectionAttempt(params: Record<string, unknown>, request: Request): Promise<boolean> {
    // if this function throws or returns false, connection is rejected, otherwise, connection will be accepted.
    throw new Error('Unauthorized');
  }
}
```

## See Also

- [Websocket Plugin](./websocket-plugin.md) - Documentation of the Websocket Plugin
- [Namespace Decorator](./namespace-decorator.md) - Documentation of the Namespace decorator
- [Message Decorator](./message-decorator.md) - Documentation of the Message decorator
- [Emit Decorator](./emit-decorator.md) - Documentation of the Emit decorator
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator