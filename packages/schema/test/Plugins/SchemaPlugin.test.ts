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
});
