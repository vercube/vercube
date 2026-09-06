import { describe, test } from 'vitest';
import { createTestApp } from '../Utils/App.mock';
import type { App } from '@vercube/core';

const app: App = await createTestApp();

// This bench should simulate a 404 request when no route is found
describe('[Bench] Application', () => {
  describe('[GET] 404', () => {
    test('Fetch 404', async ({ bench }) => {
      await bench('Fetch 404', async () => {
        await app.fetch(new Request('http://localhost/not-found'));
      }).run();
    });
  });

  describe('[GET] without middlewares', () => {
    test('Fetch GET', async ({ bench }) => {
      await bench('Fetch GET', async () => {
        await app.fetch(new Request('http://localhost/mock/get'));
      }).run();
    });
  });

  describe('[POST] methods', () => {
    test('Fetch POST', async ({ bench }) => {
      await bench('Fetch POST', async () => {
        await app.fetch(
          new Request('http://localhost/mock/post', {
            method: 'POST',
          }),
        );
      }).run();
    });

    test('Fetch POST with body', async ({ bench }) => {
      await bench('Fetch POST with body', async () => {
        await app.fetch(
          new Request('http://localhost/mock/body', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: 'data' }),
          }),
        );
      }).run();
    });

    test('Fetch POST with body validation', async ({ bench }) => {
      await bench('Fetch POST with body validation', async () => {
        await app.fetch(
          new Request('http://localhost/mock/body-validation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'test', age: 25 }),
          }),
        );
      }).run();
    });

    test('Fetch POST with multipart form data', async ({ bench }) => {
      await bench('Fetch POST with multipart form data', async () => {
        const formData = new FormData();
        formData.append('file', new Blob(['test']), 'test.txt');
        formData.append('field', 'value');

        await app.fetch(
          new Request('http://localhost/mock/multipart-form-data', {
            method: 'POST',
            body: formData,
          }),
        );
      }).run();
    });
  });

  describe('[PUT] methods', () => {
    test('Fetch PUT', async ({ bench }) => {
      await bench('Fetch PUT', async () => {
        await app.fetch(
          new Request('http://localhost/mock/put', {
            method: 'PUT',
          }),
        );
      }).run();
    });
  });

  describe('[DELETE] methods', () => {
    test('Fetch DELETE', async ({ bench }) => {
      await bench('Fetch DELETE', async () => {
        await app.fetch(
          new Request('http://localhost/mock/delete', {
            method: 'DELETE',
          }),
        );
      }).run();
    });
  });

  describe('[PATCH] methods', () => {
    test('Fetch PATCH', async ({ bench }) => {
      await bench('Fetch PATCH', async () => {
        await app.fetch(
          new Request('http://localhost/mock/patch', {
            method: 'PATCH',
          }),
        );
      }).run();
    });
  });

  describe('[TRACE] methods', () => {
    test('Fetch TRACE', async ({ bench }) => {
      await bench('Fetch TRACE', async () => {
        await app.fetch(
          new Request('http://localhost/mock/trace', {
            method: 'TRACE',
          }),
        );
      }).run();
    });
  });

  describe('[HEAD] methods', () => {
    test('Fetch HEAD', async ({ bench }) => {
      await bench('Fetch HEAD', async () => {
        await app.fetch(
          new Request('http://localhost/mock/head', {
            method: 'HEAD',
          }),
        );
      }).run();
    });
  });

  describe('[CONNECT] methods', () => {
    test('Fetch CONNECT', async ({ bench }) => {
      await bench('Fetch CONNECT', async () => {
        await app.fetch(
          new Request('http://localhost/mock/connect', {
            method: 'CONNECT',
          }),
        );
      }).run();
    });
  });

  describe('[OPTIONS] methods', () => {
    test('Fetch OPTIONS', async ({ bench }) => {
      await bench('Fetch OPTIONS', async () => {
        await app.fetch(
          new Request('http://localhost/mock/options', {
            method: 'OPTIONS',
          }),
        );
      }).run();
    });
  });

  describe('[GET] with query parameters', () => {
    test('Fetch GET with query param', async ({ bench }) => {
      await bench('Fetch GET with query param', async () => {
        await app.fetch(new Request('http://localhost/mock/query?age=25'));
      }).run();
    });

    test('Fetch GET with query param validation', async ({ bench }) => {
      await bench('Fetch GET with query param validation', async () => {
        await app.fetch(new Request('http://localhost/mock/query-validation?age=25'));
      }).run();
    });

    test('Fetch GET with query params', async ({ bench }) => {
      await bench('Fetch GET with query params', async () => {
        await app.fetch(new Request('http://localhost/mock/query-params?age=25&name=test'));
      }).run();
    });

    test('Fetch GET with query params validation', async ({ bench }) => {
      await bench('Fetch GET with query params validation', async () => {
        await app.fetch(new Request('http://localhost/mock/query-params-validation?age=25'));
      }).run();
    });
  });

  describe('[GET] with path parameters', () => {
    test('Fetch GET with path param', async ({ bench }) => {
      await bench('Fetch GET with path param', async () => {
        await app.fetch(new Request('http://localhost/mock/test-param'));
      }).run();
    });
  });

  describe('[GET] with headers', () => {
    test('Fetch GET with header', async ({ bench }) => {
      await bench('Fetch GET with header', async () => {
        await app.fetch(
          new Request('http://localhost/mock/header', {
            headers: { 'x-test': 'test-value' },
          }),
        );
      }).run();
    });

    test('Fetch GET with headers', async ({ bench }) => {
      await bench('Fetch GET with headers', async () => {
        await app.fetch(
          new Request('http://localhost/mock/headers', {
            headers: {
              'x-test': 'test-value',
              'content-type': 'application/json',
              'user-agent': 'benchmark-test',
            },
          }),
        );
      }).run();
    });
  });

  describe('[GET] with response decorators', () => {
    test('Fetch GET with redirect', async ({ bench }) => {
      await bench('Fetch GET with redirect', async () => {
        await app.fetch(new Request('http://localhost/mock/redirect'));
      }).run();
    });

    test('Fetch GET with status', async ({ bench }) => {
      await bench('Fetch GET with status', async () => {
        await app.fetch(new Request('http://localhost/mock/status'));
      }).run();
    });

    test('Fetch GET with set header', async ({ bench }) => {
      await bench('Fetch GET with set header', async () => {
        await app.fetch(new Request('http://localhost/mock/set-header'));
      }).run();
    });
  });

  describe('[GET] with request/response objects', () => {
    test('Fetch GET with request object', async ({ bench }) => {
      await bench('Fetch GET with request object', async () => {
        await app.fetch(new Request('http://localhost/mock/request'));
      }).run();
    });

    test('Fetch GET with response object', async ({ bench }) => {
      await bench('Fetch GET with response object', async () => {
        await app.fetch(new Request('http://localhost/mock/response'));
      }).run();
    });
  });

  describe('[GET] with additional middleware', () => {
    test('Fetch GET with method-level middleware', async ({ bench }) => {
      await bench('Fetch GET with method-level middleware', async () => {
        await app.fetch(new Request('http://localhost/mock/middleware'));
      }).run();
    });
  });
});
