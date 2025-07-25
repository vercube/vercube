# Broadcast Decorator

The broadcast decorator enables you to broadcast a message to every peer on your namespace (including the peer).

The decorator accepts a string `event` - This is the event that will be sent back to the client along with the data.

## Usage

```typescript
@Namespace('/foo') // register the namespace
@Controller('/api/playground')
export default class DummyController {
  @Broadcast('test')
  public async onMessage(incomingMessage: unknown, peer: { id: string; ip: string; }): Promise<Record<string, string>> {
    // { foo: 'bar' } will be emitted to every peer on the namespace
    // including the sender
    return { foo: 'bar' }
  }
}
```

On your client side, messages will be received with the following pattern:

```typescript
{ 
  event: 'test', // the event you specified when using the decorator
  data: { foo: 'bar' } // the data returning from your function
};
```

## See Also

- [Websocket Plugin](./websocket-plugin.md) - Documentation of the Websocket Plugin
- [Namespace Decorator](./namespace-decorator.md) - Documentation of the Namespace decorator
- [OnConnectionAttempt Decorator](./on-connection-attempt-decorator.md) - Documentation of the OnConnectionAttempt decorator
- [Message Decorator](./message-decorator.md) - Documentation of the Message decorator
- [Emit Decorator](./emit-decorator.md) - Documentation of the Emit decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator