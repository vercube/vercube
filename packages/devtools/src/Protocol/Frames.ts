/**
 * The devtools wire protocol.
 *
 * Everything the server pushes travels over one stream in one envelope. The
 * previous design grew a separate shape per feature - a `request` event, a
 * `log` event, a `metrics` event - which meant every new panel invented its own
 * transport. One versioned envelope with a channel discriminator means a new
 * signal is a new channel, not a new pipe.
 *
 * Signal payloads are OTLP/JSON, the same bytes an OpenTelemetry collector
 * would receive, so nothing has to be translated on the way out and the UI
 * could in principle render data from anywhere.
 */
export namespace DevtoolsProtocol {
  /** Protocol version. Bumped when a frame's meaning changes incompatibly. */
  export const VERSION = 1;

  /** Which kind of payload a frame carries. */
  export type Channel = 'trace' | 'metric' | 'log' | 'introspect' | 'control';

  /** One message on the stream. */
  export interface Frame<T = unknown> {
    /** Protocol version, always {@link VERSION}. */
    v: number;
    /** Monotonic sequence number, so a reconnecting client can spot a gap. */
    seq: number;
    /** Unix epoch milliseconds when the frame was produced. */
    at: number;
    ch: Channel;
    data: T;
  }

  /** Payload of an `introspect` frame: a section changed, go and fetch it. */
  export interface InvalidatePayload {
    id: string;
    revision: number;
  }

  /** Payload of a `control` frame. */
  export type ControlPayload =
    | { type: 'hello'; path: string; version: number; sections: string[] }
    | { type: 'ping' }
    | { type: 'dropped'; channel: Channel; count: number };
}
