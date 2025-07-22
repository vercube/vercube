# Emit Decorator

Using the emit decorator, you can send a message back to the peer by returning anything on your function.

## Usage

```typescript
const messageSchema = z.object({
  foo: z.string().min(1, 'Foo is required'),
});

@Namespace('/foo') // register the namespace
@Controller('/api/playground')
@Middleware(FirstMiddleware)
export default class DummyController {
  @Message({ event: 'message' })
  @Emit()
  public async onMessage(incomingMessage: unknown, peer: { id: string; ip: string; }): Promise<Record<string, string>> {
    // { foo: 'bar' } will be emitted back to the peer
    return { foo: 'bar' };
  }
}
```

On your client side, messages will be received with the following pattern:

```typescript
{ 
  event: string, // the event you are listening to using @Message()
  data: unknown // the data returning from your function
};
```

## See Also

- [Websocket Plugin](./websocket-plugin.md) - Documentation of the Websocket Plugin
- [Namespace Decorator](./namespace-decorator.md) - Documentation of the Namespace decorator
- [OnConnectionAttempt Decorator](./on-connection-attempt-decorator.md) - Documentation of the OnConnectionAttempt decorator
- [Message Decorator](./message-decorator.md) - Documentation of the Message decorator
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator