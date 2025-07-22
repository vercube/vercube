# Message Decorator

The message decorator enables you to listen to messages under a specific event. You can also specify a validation schema of how the message should be and it will automatically validate for you.

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
  public async onMessage(incomingMessage: unknown, peer: { id: string; ip: string; }): Promise<Record<string, string>> {
    // no schema validation, any messages under "foo" will get here
  }

  @Message({ event: 'bar', validationSchema: messageSchema })
  public async onMessage(incomingMessage: unknown, peer: { id: string; ip: string; }): Promise<Record<string, string>> {
    // with schema validation, only properly structured messages under "bar" will get here
  }
}
```

On your client side, messages should be emitted following this pattern:

```typescript
websocket.send(
  JSON.stringify({ 
    event: 'foo', 
    data: { 
      test: 'ok' 
    } 
  })
);
```

## See Also

- [Websocket Plugin](./websocket-plugin.md) - Documentation of the Websocket Plugin
- [Namespace Decorator](./namespace-decorator.md) - Documentation of the Namespace decorator
- [OnConnectionAttempt Decorator](./on-connection-attempt-decorator.md) - Documentation of the OnConnectionAttempt decorator
- [Emit Decorator](./emit-decorator.md) - Documentation of the Emit decorator
- [Broadcast Decorator](./broadcast-decorator.md) - Documentation of the Broadcast decorator
- [BroadcastOthers Decorator](./broadcast-others-decorator.md) - Documentation of the BroadcastOthers decorator