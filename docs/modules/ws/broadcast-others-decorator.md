# BroadcastOthers Decorator

The broadcastOthers decorator enables you to broadcast a message to every peer on your namespace (excluding the peer).

## Usage

```typescript
const messageSchema = z.object({
  foo: z.string().min(1, 'Foo is required'),
});

@Namespace('/foo') // register the namespace
@Controller('/api/playground')
@Middleware(FirstMiddleware)
export default class DummyController {
  @Message({ event: 'foo' })
  @BroadcastOthers()
  public async onMessage(incomingMessage: unknown, peer: { id: string; ip: string; }): Promise<Record<string, string>> {
    // { foo: 'bar' } will be emitted to every peer on the namespace
    // excluding the sender
    return { foo: 'bar' }
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
- [Emit Decorator](./emit-decorator.md) - Documentation of the Emit decorator
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator