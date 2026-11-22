import { describe, expect, it } from 'vitest';
import { toCurl, toFetch } from '../../ui/src/playground/export';
import type { BuiltRequest } from '../../ui/src/playground/request';

const origin = 'http://localhost:3001';

const request: BuiltRequest = {
  method: 'PUT',
  target: '/orders/7?notify=true',
  headers: [
    { name: 'x-tenant', value: "o'brien", secret: false, internal: false },
    { name: 'Authorization', value: 'Bearer s3cret', secret: true, internal: false },
    { name: 'Content-Type', value: 'application/json', secret: false, internal: false },
    { name: 'x-devtools-playground', value: 'a'.repeat(32), secret: false, internal: true },
    { name: 'traceparent', value: '00-aa-bb-01', secret: false, internal: true },
  ],
  cookies: [
    { name: 'theme', value: 'dark mode', secret: false },
    { name: 'sid', value: 's1', secret: true },
  ],
  body: { kind: 'text', text: '{"sku":"A-1"}' },
};

describe('toCurl', () => {
  it('leaves out credentials and the playground headers by default', () => {
    expect(toCurl(request, { origin })).toBe(
      [
        "curl -X PUT 'http://localhost:3001/orders/7?notify=true'",
        String.raw`-H 'x-tenant: o'\''brien'`,
        "-H 'Content-Type: application/json'",
        "-H 'Cookie: theme=dark%20mode'",
        `--data-raw '{"sku":"A-1"}'`,
      ].join(' \\\n  '),
    );
  });

  it('writes credentials out when asked to', () => {
    const command = toCurl(request, { origin, includeCredentials: true });

    expect(command).toContain("-H 'Authorization: Bearer s3cret'");
    expect(command).toContain("-H 'Cookie: theme=dark%20mode; sid=s1'");
    expect(command).not.toContain('x-devtools');
    expect(command).not.toContain('traceparent');
  });

  it('writes form fields and a bare request', () => {
    expect(
      toCurl(
        {
          method: 'POST',
          target: '/upload',
          headers: [],
          cookies: [],
          body: { kind: 'form', fields: [{ name: 'title', value: 'A b' }] },
        },
        { origin },
      ),
    ).toBe("curl -X POST 'http://localhost:3001/upload' \\\n  -F 'title=A b'");
    expect(toCurl({ method: 'GET', target: '/', headers: [], cookies: [], body: { kind: 'none' } }, { origin })).toBe(
      "curl -X GET 'http://localhost:3001/'",
    );
  });
});

describe('toFetch', () => {
  it('leaves out credentials and the playground headers by default', () => {
    expect(toFetch(request, { origin })).toBe(
      [
        'const response = await fetch("http://localhost:3001/orders/7?notify=true", {',
        '  method: "PUT",',
        '  headers: {',
        '    "x-tenant": "o\'brien",',
        '    "Content-Type": "application/json",',
        '    "Cookie": "theme=dark%20mode",',
        '  },',
        String.raw`  body: "{\"sku\":\"A-1\"}",`,
        '});',
      ].join('\n'),
    );
  });

  it('writes credentials out when asked to', () => {
    const source = toFetch(request, { origin, includeCredentials: true });

    expect(source).toContain('"Authorization": "Bearer s3cret",');
    expect(source).toContain('"Cookie": "theme=dark%20mode; sid=s1",');
    expect(source).not.toContain('x-devtools');
  });

  it('writes a form body and a bare request', () => {
    expect(
      toFetch(
        {
          method: 'POST',
          target: '/upload',
          headers: [],
          cookies: [],
          body: { kind: 'form', fields: [{ name: 'title', value: 'A b' }] },
        },
        { origin },
      ),
    ).toBe(
      [
        'const form = new FormData();',
        'form.append("title", "A b");',
        '',
        'const response = await fetch("http://localhost:3001/upload", {',
        '  method: "POST",',
        '  body: form,',
        '});',
      ].join('\n'),
    );
    expect(toFetch({ method: 'GET', target: '/', headers: [], cookies: [], body: { kind: 'none' } }, { origin })).toBe(
      'const response = await fetch("http://localhost:3001/", {\n  method: "GET",\n});',
    );
  });
});
