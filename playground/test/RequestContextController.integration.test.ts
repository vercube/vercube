import { createApp } from '@vercube/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { RequestContextController } from '../src/Controllers/RequestContextController';

describe('RequestContextController integration', () => {
  let fetchApp: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    const app = await createApp();
    app.container.expand((container) => {
      container.bind(RequestContextController);
    });
    fetchApp = app.fetch.bind(app);
  });

  it('propagates bearer-derived user id from middleware to controller', async () => {
    const response = await fetchApp(
      new Request('http://localhost/api/request-context/user', {
        headers: {
          Authorization: 'Bearer user-2137',
        },
      }),
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as { userId?: string; message: string };
    expect(data.userId).toBe('2137');
    expect(data.message).toBe('User ID retrieved from request context: 2137');
  });

  it('returns expected metadata populated by middleware', async () => {
    const response = await fetchApp(
      new Request('http://localhost/api/request-context/metadata', {
        headers: {
          Authorization: 'Bearer user-123',
        },
      }),
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      requestId?: string;
      requestMethod?: string;
      requestUrl?: string;
      requestStartTime?: number;
      processingTime?: number;
      allKeys: string[];
    };

    expect(data.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(data.requestMethod).toBe('GET');
    expect(data.requestUrl).toBe('http://localhost/api/request-context/metadata');
    expect(typeof data.requestStartTime).toBe('number');
    expect(typeof data.processingTime).toBe('number');

    expect(data.allKeys).toEqual(
      expect.arrayContaining(['bearerToken', 'userId', 'requestId', 'requestStartTime', 'requestMethod', 'requestUrl']),
    );
  });

  it('keeps current response shape when authorization header is missing', async () => {
    const response = await fetchApp(new Request('http://localhost/api/request-context/user'));

    expect(response.status).toBe(200);

    const data = (await response.json()) as { userId?: string; message: string };
    expect(data.userId).toBeUndefined();
    expect(data.message).toBe('No user ID found in context. Make sure to include Authorization header with Bearer token.');
  });
});
