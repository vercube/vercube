import { IntrospectionRegistry } from '@vercube/core';
import { createTestApp } from '@vercube/testing';
import { describe, expect, it } from 'vitest';
import { SchemaPlugin } from '../../src';

describe('SchemaPlugin', () => {
  it('should register OpenAPI and Scalar HTTP routes', async () => {
    await using app = await createTestApp({ plugins: [SchemaPlugin] });

    await app.get('/_schema/').expect(200);

    const docs = await app
      .get('/_schema/docs')
      .expect(200)
      .expect('content-type', /text\/html/);

    const html = await docs.text();
    expect(html).toContain('Scalar API Reference');
    expect(html).toContain('/_schema/');
  });

  it('should not serve Scalar when disabled in plugin options', async () => {
    await using app = await createTestApp({ plugins: [[SchemaPlugin, { scalar: false }]] });

    await app.get('/_schema/docs').expect(404);
  });

  it('should use API / 1.0.0 as info when no document options are given', async () => {
    await using app = await createTestApp({ plugins: [SchemaPlugin] });

    const doc = await (await app.get('/_schema/').expect(200)).json<any>();

    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info).toEqual({ title: 'API', version: '1.0.0' });
    expect(doc.servers).toBeUndefined();
  });

  it('should apply document and components options', async () => {
    await using app = await createTestApp({
      plugins: [
        [
          SchemaPlugin,
          {
            document: {
              info: { title: 'Community API', description: 'Docs' },
              servers: [{ url: 'https://api.example.com/v1' }],
              security: [{ bearerAuth: [] }],
              tags: [{ name: 'pages' }],
            },
            components: {
              securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
            },
          },
        ],
      ],
    });

    const doc = await (await app.get('/_schema/').expect(200)).json<any>();

    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info).toEqual({ title: 'Community API', version: '1.0.0', description: 'Docs' });
    expect(doc.servers).toEqual([{ url: 'https://api.example.com/v1' }]);
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.tags).toEqual([{ name: 'pages' }]);
    expect(doc.components.securitySchemes).toEqual({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
  });

  describe('exposure', () => {
    it('should not serve the endpoints in production by default', async () => {
      await using app = await createTestApp({ config: { production: true }, plugins: [SchemaPlugin] });

      await app.get('/_schema/').expect(404);
      await app.get('/_schema/docs').expect(404);
      expect(app.logs.find('warn', /SchemaPlugin/)).toBeUndefined();
    });

    it('should keep publishing the document to introspection when the endpoints are off', async () => {
      await using app = await createTestApp({ plugins: [[SchemaPlugin, { enabled: false }]] });

      await app.get('/_schema/').expect(404);

      const section = await app.resolve(IntrospectionRegistry).describe<any>('openapi');
      expect(section?.data.openapi).toBe('3.0.0');
    });

    it('should serve the endpoints in production when enabled and warn that they are public', async () => {
      await using app = await createTestApp({
        config: { production: true },
        plugins: [[SchemaPlugin, { enabled: true }]],
      });

      await app.get('/_schema/').expect(200);
      expect(app.logs.find('warn', /without a token/)).toBeDefined();
    });

    it('should not warn in production when a token guards the endpoints', async () => {
      await using app = await createTestApp({
        config: { production: true },
        plugins: [[SchemaPlugin, { enabled: true, token: 'secret' }]],
      });

      expect(app.logs.find('warn', /without a token/)).toBeUndefined();
    });

    it('should serve the endpoints under a custom path', async () => {
      await using app = await createTestApp({ plugins: [[SchemaPlugin, { path: '/internal/openapi/' }]] });

      await app.get('/_schema/').expect(404);
      await app.get('/internal/openapi/').expect(200);

      const html = await (await app.get('/internal/openapi/docs').expect(200)).text();
      expect(html).toContain('/internal/openapi/');
      expect(html).not.toContain('/_schema/');
    });

    it('should fall back to the default path when the path is empty', async () => {
      await using app = await createTestApp({ plugins: [[SchemaPlugin, { path: '/' }]] });

      await app.get('/_schema/').expect(200);
    });
  });

  describe('token', () => {
    it('should reject requests without the token', async () => {
      await using app = await createTestApp({ plugins: [[SchemaPlugin, { token: 'secret' }]] });

      await app.get('/_schema/').expect(401);
      await app.get('/_schema/docs').expect(401);
      await app.get('/_schema/').header('x-schema-token', 'wrong').expect(401);
    });

    it('should accept the token in the header', async () => {
      await using app = await createTestApp({ plugins: [[SchemaPlugin, { token: 'secret' }]] });

      await app.get('/_schema/').header('x-schema-token', 'secret').expect(200);
    });

    it('should accept the token as a query parameter on the docs page only', async () => {
      await using app = await createTestApp({ plugins: [[SchemaPlugin, { token: 'secret' }]] });

      await app.get('/_schema/?token=secret').expect(401);

      const html = await (await app.get('/_schema/docs?token=secret').expect(200)).text();
      // the page carries the document, since the browser cannot fetch it without the token
      expect(html).toMatch(/"openapi": ?"3.0.0"/);
    });

    it('should keep an explicit openApiUrl behind a token', async () => {
      await using app = await createTestApp({
        plugins: [[SchemaPlugin, { token: 'secret', scalar: { openApiUrl: '/proxied/openapi.json' } }]],
      });

      const html = await (await app.get('/_schema/docs').header('x-schema-token', 'secret').expect(200)).text();
      expect(html).toContain('/proxied/openapi.json');
    });
  });

  it('should not duplicate components when the document is generated again', async () => {
    await using app = await createTestApp({
      plugins: [[SchemaPlugin, { components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } }]],
    });

    await app.get('/_schema/').expect(200);
    const doc = await (await app.get('/_schema/').expect(200)).json<any>();

    expect(Object.keys(doc.components.securitySchemes)).toEqual(['bearerAuth']);
  });
});
