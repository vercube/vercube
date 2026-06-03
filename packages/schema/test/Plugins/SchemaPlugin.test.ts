import { createApp } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { SchemaPlugin } from '../../src';

describe('SchemaPlugin', () => {
  it('should register OpenAPI and Scalar HTTP routes', async () => {
    const app = await createApp({
      setup: async (app) => {
        app.addPlugin(SchemaPlugin);
      },
    });

    const openApi = await app.fetch(new Request('http://localhost/_schema/'));
    expect(openApi.status).toBe(200);

    const docs = await app.fetch(new Request('http://localhost/_schema/docs'));
    expect(docs.status).toBe(200);
    expect(docs.headers.get('content-type')).toContain('text/html');

    const html = await docs.text();
    expect(html).toContain('Scalar API Reference');
    expect(html).toContain('/_schema/');
  });

  it('should not serve Scalar when disabled in plugin options', async () => {
    const app = await createApp({
      setup: async (app) => {
        app.addPlugin(SchemaPlugin, { scalar: false });
      },
    });

    const response = await app.fetch(new Request('http://localhost/_schema/docs'));

    expect(response.status).toBe(404);
  });
});
