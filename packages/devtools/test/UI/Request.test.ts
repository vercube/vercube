import { describe, expect, it } from 'vitest';
import { buildRequest, createDraft, describeForm, needsConfirmation, validateDraft } from '../../ui/src/playground/request';
import type { Draft } from '../../ui/src/playground/request';
import type { IntrospectionTypes } from '@vercube/core';

/**
 * Builds a route description.
 *
 * @param method - HTTP method
 * @param path - Route template
 * @param args - Handler arguments
 * @returns The description
 */
function route(
  method: string,
  path: string,
  args: Partial<IntrospectionTypes.RouteArg>[] = [],
): IntrospectionTypes.RouteDescription {
  return {
    id: `${method} ${path}`,
    method,
    path,
    controller: 'OrdersController',
    handler: 'handle',
    args: args.map((arg, idx) => ({ idx, type: 'body', validated: Boolean(arg.schema), ...arg })),
    middlewares: [],
    actions: 0,
    simple: false,
  };
}

const bodySchema = {
  type: 'object',
  required: ['sku'],
  properties: { sku: { type: 'string', minLength: 1 }, quantity: { type: 'integer', minimum: 1 } },
};

const querySchema = {
  type: 'object',
  required: ['notify'],
  properties: {
    notify: { type: 'boolean' },
    limit: { type: 'integer', maximum: 50 },
    tag: { type: 'array', items: { type: 'string' } },
  },
};

const update = route('PUT', '/orders/:id', [
  { type: 'param', name: 'id', schema: { type: 'integer', minimum: 1 } },
  { type: 'body', schema: bodySchema },
  { type: 'query-params', schema: querySchema },
  { type: 'query-param', name: 'limit' },
  { type: 'query-param', name: 'trace' },
  { type: 'header', name: 'x-tenant' },
  { type: 'header', name: 'x-tenant' },
  { type: 'cookie', name: 'session' },
  { type: 'request' },
]);

const marker = { id: 'a'.repeat(32), traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01` };

describe('describeForm', () => {
  it('offers one field per thing the handler reads', () => {
    const model = describeForm(update);

    expect(model.methods).toEqual(['PUT']);
    expect(model.params).toEqual([{ name: 'id', rest: false, required: true, schema: { type: 'integer', minimum: 1 } }]);
    expect(model.query.map((field) => [field.name, field.required])).toEqual([
      ['limit', false],
      ['trace', false],
      ['notify', true],
      ['tag', false],
    ]);
    expect(model.query[0].schema).toEqual({ type: 'integer', maximum: 50 });
    expect(model.headers).toEqual([{ name: 'x-tenant', required: false, schema: undefined }]);
    expect(model.cookies.map((field) => field.name)).toEqual(['session']);
    expect(model.bodySchema).toBe(bodySchema);
    expect(model.bodyMode).toBe('json');
  });

  it('takes path placeholders from the template even when no argument reads them', () => {
    expect(describeForm(route('GET', '/files/**:path')).params).toEqual([
      { name: 'path', rest: true, required: true, schema: undefined },
    ]);
  });

  it('offers both methods of a folded GET and no body', () => {
    const model = describeForm(route('GET / HEAD', '/orders'));

    expect(model.methods).toEqual(['GET', 'HEAD']);
    expect(model.bodyMode).toBe('none');
  });

  it('offers a body for a write even without a body argument', () => {
    expect(describeForm(route('POST', '/orders')).bodyMode).toBe('json');
    expect(describeForm(route('DELETE', '/orders/:id')).bodyMode).toBe('none');
  });

  it('starts in form mode for a multipart handler', () => {
    expect(describeForm(route('POST', '/upload', [{ type: 'multipart-form-data' }])).bodyMode).toBe('form');
  });
});

describe('createDraft', () => {
  it('starts from empty fields and an example body', () => {
    expect(createDraft(describeForm(update))).toEqual({
      method: 'PUT',
      params: { id: '' },
      query: [
        { name: 'limit', value: '' },
        { name: 'trace', value: '' },
        { name: 'notify', value: '' },
        { name: 'tag', value: '' },
      ],
      headers: [{ name: 'x-tenant', value: '' }],
      bodyMode: 'json',
      body: '{\n  "sku": "string",\n  "quantity": 1\n}',
      form: [],
    });
  });

  it('leaves the editor empty without a schema', () => {
    expect(createDraft(describeForm(route('POST', '/orders'))).body).toBe('');
  });
});

describe('needsConfirmation', () => {
  it('asks for the methods that change state', () => {
    expect(['POST', 'PUT', 'PATCH', 'DELETE', 'delete'].map((method) => needsConfirmation(method))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(['GET', 'HEAD', 'OPTIONS'].map((method) => needsConfirmation(method))).toEqual([false, false, false]);
  });
});

describe('validateDraft', () => {
  const model = describeForm(update);

  /**
   * A valid draft with some fields replaced.
   *
   * @param changes - Fields to replace
   * @returns The draft
   */
  function draft(changes: Partial<Draft> = {}): Draft {
    return {
      ...createDraft(model),
      params: { id: '7' },
      query: [{ name: 'notify', value: 'true' }],
      body: '{"sku":"A-1","quantity":2}',
      ...changes,
    };
  }

  it('accepts a draft that fits', () => {
    expect(validateDraft(draft(), model)).toEqual({ params: [], query: [], body: [] });
  });

  it('requires every path value and checks it as the type the schema names', () => {
    expect(validateDraft(draft({ params: { id: '' } }), model).params).toEqual([{ path: 'id', message: 'is required' }]);
    expect(validateDraft(draft({ params: { id: '0' } }), model).params).toEqual([{ path: 'id', message: 'must be at least 1' }]);
    expect(validateDraft(draft({ params: { id: 'abc' } }), model).params).toEqual([
      { path: 'id', message: 'must be integer, got string' },
    ]);
    expect(validateDraft(draft({ params: {} }), model).params).toEqual([{ path: 'id', message: 'is required' }]);
  });

  it('checks the query as one object, reading text as the declared types', () => {
    expect(validateDraft(draft({ query: [] }), model).query).toEqual([{ path: 'notify', message: 'is required' }]);
    expect(
      validateDraft(
        draft({
          query: [
            { name: 'notify', value: 'yes' },
            { name: 'limit', value: '80' },
            { name: ' ', value: 'ignored' },
            { name: 'trace', value: '' },
          ],
        }),
        model,
      ).query,
    ).toEqual([
      // `notify=yes` is not reported: what text a boolean coercion takes is the server's business.
      { path: 'limit', message: 'must be at most 50' },
    ]);
  });

  it('reads a repeated name as a list where the schema takes a list', () => {
    expect(
      validateDraft(
        draft({
          query: [
            { name: 'notify', value: 'true' },
            { name: 'tag', value: 'a' },
            { name: 'tag', value: 'b' },
            { name: 'tag', value: 'c' },
          ],
        }),
        model,
      ).query,
    ).toEqual([]);
  });

  it('reads one entry as a list of one where the schema takes a list', () => {
    expect(
      validateDraft(
        draft({
          query: [
            { name: 'notify', value: 'true' },
            { name: 'tag', value: 'a' },
          ],
        }),
        model,
      ).query,
    ).toEqual([]);
  });

  it('reads a repeated name as its first value where the schema takes no list, as core does', () => {
    const repeated = (first: string, second: string): Draft =>
      draft({
        query: [
          { name: 'notify', value: 'true' },
          { name: 'limit', value: first },
          { name: 'limit', value: second },
        ],
      });

    expect(validateDraft(repeated('10', '80'), model).query).toEqual([]);
    expect(validateDraft(repeated('80', '10'), model).query).toEqual([{ path: 'limit', message: 'must be at most 50' }]);
  });

  it('checks a list of numbers written as query entries', () => {
    const listed = describeForm(
      route('GET', '/orders', [
        {
          type: 'query-params',
          schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'number', minimum: 1 } } } },
        },
      ]),
    );

    /**
     * Checks the query for the given `ids` entries.
     *
     * @param values - One value per `ids` entry
     * @returns The problems found
     */
    const check = (...values: string[]): unknown =>
      validateDraft({ ...createDraft(listed), query: values.map((value) => ({ name: 'ids', value })) }, listed).query;

    expect(check('1')).toEqual([]);
    expect(check('1', '2')).toEqual([]);
    expect(check('1', '0')).toEqual([{ path: 'ids[1]', message: 'must be at least 1' }]);
    expect(check('1', 'abc')).toEqual([{ path: 'ids[1]', message: 'must be number, got string' }]);
  });

  it('checks named query entries on their own when there is no object schema', () => {
    const named = describeForm(
      route('GET', '/orders', [{ type: 'query-param', name: 'limit', schema: { type: 'integer', maximum: 5 } }]),
    );

    expect(validateDraft({ ...createDraft(named), query: [{ name: 'limit', value: '9' }] }, named).query).toEqual([
      { path: 'limit', message: 'must be at most 5' },
    ]);
    expect(validateDraft(createDraft(named), named).query).toEqual([]);
  });

  it('checks the body against its schema', () => {
    expect(validateDraft(draft({ body: '{"quantity":0}' }), model).body).toEqual([
      { path: 'sku', message: 'is required' },
      { path: 'quantity', message: 'must be at least 1' },
    ]);
  });

  it('reports JSON that does not parse and a missing body', () => {
    expect(validateDraft(draft({ body: '{' }), model).body[0].message).toMatch(/^is not valid JSON: /);
    expect(validateDraft(draft({ body: '  ' }), model).body).toEqual([{ path: '', message: 'is required' }]);
  });

  it('checks nothing in the other body modes or without a schema', () => {
    const free = describeForm(route('POST', '/orders'));

    expect(validateDraft(draft({ bodyMode: 'text', body: 'not json' }), model).body).toEqual([]);
    expect(validateDraft(draft({ bodyMode: 'none' }), model).body).toEqual([]);
    expect(validateDraft({ ...createDraft(free), body: '{"anything":true}' }, free).body).toEqual([]);
    expect(validateDraft(createDraft(free), free).body).toEqual([]);
    expect(validateDraft({ ...createDraft(free), body: 'nope' }, free).body).toHaveLength(1);
  });
});

describe('buildRequest', () => {
  const model = describeForm(update);
  const filled: Draft = {
    ...createDraft(model),
    params: { id: '7' },
    query: [{ name: 'notify', value: 'true' }],
    headers: [
      { name: 'x-tenant', value: 'acme' },
      { name: 'x-empty', value: '' },
      { name: '', value: 'nameless' },
    ],
    body: '{"sku":"A-1"}',
  };

  /**
   * Looks a header up by name.
   *
   * @param headers - Headers of a built request
   * @param name - Header name, any case
   * @returns The header value, or undefined
   */
  function header(headers: { name: string; value: string }[], name: string): string | undefined {
    return headers.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value;
  }

  it('builds the target, the headers and the body', () => {
    const { request, missing } = buildRequest(update, filled);

    expect(missing).toEqual([]);
    expect(request.method).toBe('PUT');
    expect(request.target).toBe('/orders/7?notify=true');
    expect(request.body).toEqual({ kind: 'text', text: '{"sku":"A-1"}' });
    expect(request.headers.map((entry) => entry.name)).toEqual(['x-tenant', 'Content-Type', 'Accept']);
    expect(header(request.headers, 'content-type')).toBe('application/json');
    // A cookie the handler reads is described by the form model and is no part of the request.
    expect(request).not.toHaveProperty('cookies');
    expect(header(request.headers, 'cookie')).toBeUndefined();
  });

  it('reports unfilled placeholders', () => {
    expect(buildRequest(update, { ...filled, params: {} }).missing).toEqual(['id']);
  });

  it('adds the marker headers and names the credentials to withhold', () => {
    const { request } = buildRequest(update, filled, {
      marker,
      credentials: { headers: [{ name: 'X-Client-Id', value: 'k1' }] },
    });

    expect(header(request.headers, 'x-devtools-request')).toBe('1');
    expect(header(request.headers, 'x-devtools-playground')).toBe(marker.id);
    expect(header(request.headers, 'traceparent')).toBe(marker.traceparent);
    expect(header(request.headers, 'x-devtools-playground-redact')).toBe('x-client-id');
    expect(request.headers.filter((entry) => entry.internal).map((entry) => entry.name)).toEqual([
      'x-devtools-request',
      'x-devtools-playground',
      'traceparent',
      'x-devtools-playground-redact',
    ]);
    expect(request.headers.find((entry) => entry.name === 'X-Client-Id')).toMatchObject({ secret: true, internal: false });
  });

  it('names no header to withhold when there are no credentials', () => {
    expect(header(buildRequest(update, filled, { marker }).request.headers, 'x-devtools-playground-redact')).toBeUndefined();
  });

  it('lets a header the user typed win over the one the playground would add', () => {
    const { request } = buildRequest(
      update,
      {
        ...filled,
        headers: [
          { name: 'content-type', value: 'application/merge-patch+json' },
          { name: 'Authorization', value: 'Bearer typed' },
          { name: 'accept', value: 'text/csv' },
        ],
      },
      { credentials: { headers: [{ name: 'authorization', value: 'Bearer stored' }] } },
    );

    expect(request.headers).toEqual([
      { name: 'content-type', value: 'application/merge-patch+json', secret: false, internal: false },
      { name: 'Authorization', value: 'Bearer typed', secret: false, internal: false },
      { name: 'accept', value: 'text/csv', secret: false, internal: false },
    ]);
  });

  it('sends text as text and nothing for an empty body', () => {
    const text = buildRequest(update, { ...filled, bodyMode: 'text', body: 'hello' }).request;

    expect(text.body).toEqual({ kind: 'text', text: 'hello' });
    expect(header(text.headers, 'content-type')).toBe('text/plain');

    for (const draft of [
      { ...filled, body: '' },
      { ...filled, bodyMode: 'none' as const },
    ]) {
      const empty = buildRequest(update, draft).request;

      expect(empty.body).toEqual({ kind: 'none' });
      expect(header(empty.headers, 'content-type')).toBeUndefined();
    }
  });

  it('sends form fields without a content type, which the browser writes', () => {
    const { request } = buildRequest(update, {
      ...filled,
      bodyMode: 'form',
      form: [
        { name: 'title', value: 'Report' },
        { name: ' ', value: 'dropped' },
      ],
    });

    expect(request.body).toEqual({ kind: 'form', fields: [{ name: 'title', value: 'Report' }] });
    expect(header(request.headers, 'content-type')).toBeUndefined();
  });

  it('never sends a body with GET or HEAD', () => {
    const list = route('GET / HEAD', '/orders');

    for (const method of ['GET', 'HEAD']) {
      expect(buildRequest(list, { ...filled, method, params: {} }).request.body).toEqual({ kind: 'none' });
    }
  });
});
