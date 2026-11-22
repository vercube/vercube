import { Controller, createApp, Get, HttpServer } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { toServerlessHandler } from '../../src/Adapters/aws-lambda';

const TEXT = 'a line that would compress well. '.repeat(100);

@Controller('/lambda')
class LambdaController {
  @Get('/text')
  public text(): { text: string } {
    return { text: TEXT };
  }
}

describe('aws-lambda adapter and response compression', () => {
  it('turns compression off, as a Lambda result cannot carry a compressed text body', async () => {
    const app = await createApp({
      cfg: { requestLogging: false, logLevel: 'error', compression: true },
      configFile: false,
      setup: (instance) => instance.container.bind(LambdaController),
    });

    expect(app.container.get(HttpServer).compressionEncodings).toEqual(['br', 'gzip', 'deflate']);

    const handler = toServerlessHandler(app);

    expect(app.container.get(HttpServer).compressionEncodings).toEqual([]);

    const result = (await handler(
      {
        version: '2.0',
        rawPath: '/lambda/text',
        rawQueryString: '',
        headers: { 'accept-encoding': 'gzip, br', host: 'localhost' },
        requestContext: { http: { method: 'GET', path: '/lambda/text' }, domainName: 'localhost' },
        isBase64Encoded: false,
      } as never,
      {} as never,
    )) as { statusCode: number; headers: Record<string, string>; body: string; isBase64Encoded?: boolean };

    expect(result.statusCode).toBe(200);
    expect(result.headers['content-encoding']).toBeUndefined();
    expect(result.isBase64Encoded).toBeFalsy();
    expect(JSON.parse(result.body)).toEqual({ text: TEXT });
  });
});
