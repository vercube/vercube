import { bench, describe } from 'vitest';
import { createTestApp } from '../Utils/App.mock';
import type { App } from '@vercube/core';

const app: App = await createTestApp();

// This bench should simulate a 404 request when no route is found
describe('[Bench] Application', () => {
  describe('[GET] 404', () => {
    bench('Fetch 404', async () => {
      await app.fetch(new Request('http://localhost/not-found'));
    });
  });

  describe('[GET] without middlewares', () => {
    bench('Fetch GET', async () => {
      await app.fetch(new Request('http://localhost/mock/get'));
    });
  });

  describe('[POST] methods', () => {
    bench('Fetch POST', async () => {
      await app.fetch(
        new Request('http://localhost/mock/post', {
          method: 'POST',
        }),
      );
    });

    bench('Fetch POST with body', async () => {
      await app.fetch(
        new Request('http://localhost/mock/body', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' }),
        }),
      );
    });

    bench('Fetch POST with body validation', async () => {
      await app.fetch(
        new Request('http://localhost/mock/body-validation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'test', age: 25 }),
        }),
      );
    });

    bench('Fetch POST with multipart form data', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test']), 'test.txt');
      formData.append('field', 'value');

      await app.fetch(
        new Request('http://localhost/mock/multipart-form-data', {
          method: 'POST',
          body: formData,
        }),
      );
    });
  });

  describe('[PUT] methods', () => {
    bench('Fetch PUT', async () => {
      await app.fetch(
        new Request('http://localhost/mock/put', {
          method: 'PUT',
        }),
      );
    });
  });

  describe('[DELETE] methods', () => {
    bench('Fetch DELETE', async () => {
      await app.fetch(
        new Request('http://localhost/mock/delete', {
          method: 'DELETE',
        }),
      );
    });
  });

  describe('[PATCH] methods', () => {
    bench('Fetch PATCH', async () => {
      await app.fetch(
        new Request('http://localhost/mock/patch', {
          method: 'PATCH',
        }),
      );
    });
  });

  describe('[TRACE] methods', () => {
    bench('Fetch TRACE', async () => {
      await app.fetch(
        new Request('http://localhost/mock/trace', {
          method: 'TRACE',
        }),
      );
    });
  });

  describe('[HEAD] methods', () => {
    bench('Fetch HEAD', async () => {
      await app.fetch(
        new Request('http://localhost/mock/head', {
          method: 'HEAD',
        }),
      );
    });
  });

  describe('[CONNECT] methods', () => {
    bench('Fetch CONNECT', async () => {
      await app.fetch(
        new Request('http://localhost/mock/connect', {
          method: 'CONNECT',
        }),
      );
    });
  });

  describe('[OPTIONS] methods', () => {
    bench('Fetch OPTIONS', async () => {
      await app.fetch(
        new Request('http://localhost/mock/options', {
          method: 'OPTIONS',
        }),
      );
    });
  });

  describe('[GET] with query parameters', () => {
    bench('Fetch GET with query param', async () => {
      await app.fetch(new Request('http://localhost/mock/query?age=25'));
    });

    bench('Fetch GET with query param validation', async () => {
      await app.fetch(new Request('http://localhost/mock/query-validation?age=25'));
    });

    bench('Fetch GET with query params', async () => {
      await app.fetch(new Request('http://localhost/mock/query-params?age=25&name=test'));
    });

    bench('Fetch GET with query params validation', async () => {
      await app.fetch(new Request('http://localhost/mock/query-params-validation?age=25'));
    });
  });

  describe('[GET] with path parameters', () => {
    bench('Fetch GET with path param', async () => {
      await app.fetch(new Request('http://localhost/mock/test-param'));
    });
  });

  describe('[GET] with headers', () => {
    bench('Fetch GET with header', async () => {
      await app.fetch(
        new Request('http://localhost/mock/header', {
          headers: { 'x-test': 'test-value' },
        }),
      );
    });

    bench('Fetch GET with headers', async () => {
      await app.fetch(
        new Request('http://localhost/mock/headers', {
          headers: {
            'x-test': 'test-value',
            'content-type': 'application/json',
            'user-agent': 'benchmark-test',
          },
        }),
      );
    });
  });

  describe('[GET] with response decorators', () => {
    bench('Fetch GET with redirect', async () => {
      await app.fetch(new Request('http://localhost/mock/redirect'));
    });

    bench('Fetch GET with status', async () => {
      await app.fetch(new Request('http://localhost/mock/status'));
    });

    bench('Fetch GET with set header', async () => {
      await app.fetch(new Request('http://localhost/mock/set-header'));
    });
  });

  describe('[GET] with request/response objects', () => {
    bench('Fetch GET with request object', async () => {
      await app.fetch(new Request('http://localhost/mock/request'));
    });

    bench('Fetch GET with response object', async () => {
      await app.fetch(new Request('http://localhost/mock/response'));
    });
  });

  describe('[GET] with additional middleware', () => {
    bench('Fetch GET with method-level middleware', async () => {
      await app.fetch(new Request('http://localhost/mock/middleware'));
    });
  });
});
