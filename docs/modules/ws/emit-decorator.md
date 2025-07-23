# Emit Decorator

Using the emit decorator, you can send a message back to the peer by returning anything on your function.

The decorator accepts a string `event` - This is the event that will be sent back to the client along with the data.

## Usage

```typescript
@Namespace('/foo') // register the namespace
@Controller('/api/playground')
export default class DummyController {
  @Emit('test')
  public async onMessage(incomingMessage: unknown, peer: { id: string; ip: string; }): Promise<Record<string, string>> {
    // { foo: 'bar' } will be emitted back to the peer
    return { foo: 'bar' };
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
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator