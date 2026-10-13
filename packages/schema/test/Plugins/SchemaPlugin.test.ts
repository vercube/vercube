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

  it('should not duplicate components when the document is generated again', async () => {
    await using app = await createTestApp({
      plugins: [[SchemaPlugin, { components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } }]],
    });

    await app.get('/_schema/').expect(200);
    const doc = await (await app.get('/_schema/').expect(200)).json<any>();

    expect(Object.keys(doc.components.securitySchemes)).toEqual(['bearerAuth']);
  });
});
