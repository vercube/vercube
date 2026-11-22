import { getErrorGuidance } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { ServerlessErrors } from '../../src';
import { CloudflareBindings } from '../../src/Adapters/cloudflare';
import { NetlifyContext } from '../../src/Adapters/netlify';
import { toBuffer } from '../../src/Utils/streams';

describe('ServerlessErrors', () => {
  it('describes a body stream that errors while it is buffered', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error('socket closed');
      },
    });

    const error = await toBuffer(stream).catch((error_: unknown) => error_);

    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).message).toBe('Stream aborted: socket closed');
    expect(getErrorGuidance(error)).toMatchObject({
      code: 'VERCUBE_SERVERLESS_STREAM_ABORTED',
      link: 'https://vercube.dev/docs/core-features/errors#vercube_serverless_stream_aborted',
    });
  });

  it('describes Cloudflare bindings read outside a request', () => {
    const bindings = new CloudflareBindings();
    let error: unknown;

    try {
      void bindings.env;
    } catch (error_) {
      error = error_;
    }

    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).message).toBe(
      'CloudflareBindings was read outside a request. Bindings exist only while the Cloudflare adapter handles a request.',
    );
    expect(Object.keys(error as Error)).toEqual([]);
    expect(getErrorGuidance(error)).toMatchObject({
      code: 'VERCUBE_SERVERLESS_CLOUDFLARE_BINDINGS_OUTSIDE_REQUEST',
      fix: expect.stringContaining('`active`'),
    });
  });

  it('describes a Netlify context read outside a request', () => {
    const netlify = new NetlifyContext();
    let error: unknown;

    try {
      netlify.waitUntil(Promise.resolve());
    } catch (error_) {
      error = error_;
    }

    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).message).toBe(
      'NetlifyContext was read outside a request. The context exists only while the Netlify adapter handles a request.',
    );
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_SERVERLESS_NETLIFY_CONTEXT_OUTSIDE_REQUEST');
  });

  it('lists its errors', () => {
    expect(ServerlessErrors.describe().map((entry) => entry.code)).toEqual([
      'VERCUBE_SERVERLESS_STREAM_ABORTED',
      'VERCUBE_SERVERLESS_CLOUDFLARE_BINDINGS_OUTSIDE_REQUEST',
      'VERCUBE_SERVERLESS_NETLIFY_CONTEXT_OUTSIDE_REQUEST',
    ]);
  });
});
