import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_STORAGE_KEY,
  MAX_BODY,
  MAX_ENTRY,
  MAX_TOTAL,
  parseDraft,
  PlaygroundHistory,
  redactTarget,
  sanitiseDraft,
} from '../../ui/src/playground/history';
import { MemoryStorage } from './Storage';
import type { Draft } from '../../ui/src/playground/request';

const draft: Draft = {
  method: 'POST',
  params: { id: '7' },
  query: [{ name: 'notify', value: 'true' }],
  headers: [
    { name: 'x-tenant', value: 'acme' },
    { name: 'Authorization', value: 'Bearer typed-by-hand' },
    { name: 'X-Api-Key', value: 'k1' },
    { name: 'x-session-id', value: 's1' },
  ],
  bodyMode: 'json',
  body: '{"sku":"A-1"}',
  form: [{ name: 'title', value: 'Report' }],
};

/**
 * Records one request.
 *
 * @param history - The store
 * @param route - Route key
 * @param at - Timestamp
 * @returns The stored entry
 */
function send(history: PlaygroundHistory, route: string, at: number): ReturnType<PlaygroundHistory['record']> {
  return history.record({ at, route, method: 'POST', target: '/orders/7', draft, status: 201, durationMs: 12 });
}

describe('sanitiseDraft', () => {
  it('removes the values of headers that look like credentials', () => {
    const stored = sanitiseDraft(draft);

    expect(stored.headers).toEqual([
      { name: 'x-tenant', value: 'acme' },
      { name: 'Authorization', value: '' },
      { name: 'X-Api-Key', value: '' },
      { name: 'x-session-id', value: '' },
    ]);
    expect(stored.body).toBe(draft.body);
  });

  it('copies, so later edits do not change what was stored', () => {
    const stored = sanitiseDraft(draft);

    expect(stored).not.toBe(draft);
    expect(stored.query[0]).not.toBe(draft.query[0]);
    expect(stored.params).not.toBe(draft.params);
    expect(stored.form[0]).not.toBe(draft.form[0]);
  });

  it('drops a body too large to keep', () => {
    expect(sanitiseDraft({ ...draft, body: 'x'.repeat(40_000) }).body).toBe('');
    expect(sanitiseDraft({ ...draft, body: 'x'.repeat(MAX_BODY + 1) }).body).toBe('');
    expect(sanitiseDraft({ ...draft, body: 'x'.repeat(MAX_BODY) }).body).toHaveLength(MAX_BODY);
  });

  it('removes query and form values named like a credential', () => {
    const names = ['token', 'api_key', 'client_secret', 'Password', 'AUTHORIZATION', 'access_token', 'page'];
    const stored = sanitiseDraft({
      ...draft,
      query: names.map((name) => ({ name, value: 'v' })),
      form: names.map((name) => ({ name, value: 'v' })),
    });

    expect(stored.query.map((pair) => pair.value)).toEqual(['', '', '', '', '', '', 'v']);
    expect(stored.form.map((pair) => pair.value)).toEqual(['', '', '', '', '', '', 'v']);
    expect(stored.query.map((pair) => pair.name)).toEqual(names);
  });

  it('keeps them when the user asked for credentials to be kept', () => {
    const stored = sanitiseDraft(
      { ...draft, query: [{ name: 'token', value: 't1' }], form: [{ name: 'password', value: 'p1' }] },
      { keepCredentials: true },
    );

    expect(stored.query).toEqual([{ name: 'token', value: 't1' }]);
    expect(stored.form).toEqual([{ name: 'password', value: 'p1' }]);
    // A header is a different matter: it is never stored.
    expect(stored.headers[1]).toEqual({ name: 'Authorization', value: '' });
  });
});

describe('redactTarget', () => {
  it('removes credentials from the query and leaves the rest as written', () => {
    expect(redactTarget('/orders/7?page=2&access_token=abc&api%5Fkey=k1&q=a+b')).toBe(
      '/orders/7?page=2&access_token=redacted&api%5Fkey=redacted&q=a+b',
    );
    expect(redactTarget('/orders/7')).toBe('/orders/7');
    expect(redactTarget('/orders?token')).toBe('/orders?token');
    expect(redactTarget('/orders?%E0%A4%A=1&token=x')).toBe('/orders?%E0%A4%A=1&token=redacted');
  });
});

describe('parseDraft', () => {
  it('rebuilds a stored draft and leaves out what the form does not hold', () => {
    const stored = { ...sanitiseDraft(draft), cookies: [{ name: 'sid', value: 's1' }], extra: true };

    expect(parseDraft(structuredClone(stored))).toEqual(sanitiseDraft(draft));
  });

  it('refuses anything that is not wholly a draft', () => {
    const good = sanitiseDraft(draft);

    for (const bad of [
      null,
      'text',
      [],
      { ...good, method: 7 },
      { ...good, params: null },
      { ...good, params: ['7'] },
      { ...good, params: { id: 7 } },
      { ...good, query: 'notify=true' },
      { ...good, query: [{ name: 'notify' }] },
      { ...good, headers: [null] },
      { ...good, form: [{ name: 1, value: 'x' }] },
      { ...good, bodyMode: 'xml' },
      { ...good, body: { sku: 'A-1' } },
    ]) {
      expect(parseDraft(bad)).toBeNull();
    }
  });
});

describe('PlaygroundHistory', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the entries of a route, newest first', () => {
    const history = new PlaygroundHistory(new MemoryStorage());

    send(history, 'POST /orders', 1);
    send(history, 'GET /orders', 2);
    send(history, 'POST /orders', 3);

    expect(history.recent('POST /orders').map((entry) => entry.at)).toEqual([3, 1]);
    expect(history.recent('GET /orders')).toHaveLength(1);
    expect(history.recent('GET /nothing')).toEqual([]);
  });

  it('stores what was sent without credentials', () => {
    const storage = new MemoryStorage();

    send(new PlaygroundHistory(storage), 'POST /orders', 1);

    const raw = storage.getItem(HISTORY_STORAGE_KEY)!;

    expect(raw).toContain('"status":201');
    expect(raw).toContain('acme');
    expect(raw).not.toContain('typed-by-hand');
    expect(raw).not.toContain('k1');
    expect(raw).not.toContain('s1"');
  });

  it('survives a reload', () => {
    const storage = new MemoryStorage();

    send(new PlaygroundHistory(storage), 'POST /orders', 1);

    expect(new PlaygroundHistory(storage).recent('POST /orders')).toHaveLength(1);
  });

  it('gives entries recorded in the same millisecond their own ids', () => {
    const history = new PlaygroundHistory(null);

    expect(send(history, 'POST /orders', 5).id).not.toBe(send(history, 'POST /orders', 5).id);
  });

  it('keeps fifteen entries per route', () => {
    const history = new PlaygroundHistory(null);

    for (let at = 1; at <= 20; at++) {
      send(history, 'POST /orders', at);
    }

    send(history, 'GET /orders', 21);

    expect(history.recent('POST /orders').map((entry) => entry.at)).toEqual(Array.from({ length: 15 }, (_, index) => 20 - index));
    expect(history.recent('GET /orders')).toHaveLength(1);
  });

  it('keeps a hundred and fifty entries in total', () => {
    const history = new PlaygroundHistory(null);

    for (let at = 1; at <= 160; at++) {
      send(history, `GET /route-${at}`, at);
    }

    expect(history.recent('GET /route-1')).toEqual([]);
    expect(history.recent('GET /route-10')).toEqual([]);
    expect(history.recent('GET /route-11')).toHaveLength(1);
    expect(history.recent('GET /route-160')).toHaveLength(1);
  });

  it('keeps saved requests apart and past the limits', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const history = new PlaygroundHistory(new MemoryStorage());
    const saved = history.save('POST /orders', ' Happy path ', draft, '/orders/7');

    for (let at = 1; at <= 20; at++) {
      send(history, 'POST /orders', at);
    }

    expect(saved).toMatchObject({ name: 'Happy path', at: 1000, method: 'POST', target: '/orders/7' });
    expect(history.saved('POST /orders').map((entry) => entry.id)).toEqual([saved.id]);
    expect(history.recent('POST /orders')).toHaveLength(15);
    expect(history.saved('POST /orders')[0].draft.headers[1].value).toBe('');
  });

  it('names a saved request after its target when no name is given', () => {
    expect(new PlaygroundHistory(null).save('POST /orders', '  ', draft, '/orders/7').name).toBe('/orders/7');
  });

  it('stores no credential that was typed into the query or a form field', () => {
    const storage = new MemoryStorage();
    const history = new PlaygroundHistory(storage);
    const typed: Draft = {
      ...draft,
      query: [{ name: 'access_token', value: 'q-secret' }],
      form: [{ name: 'password', value: 'f-secret' }],
    };

    history.record({ at: 1, route: 'POST /orders', method: 'POST', target: '/orders/7?access_token=q-secret', draft: typed });

    const saved = history.save('POST /orders', '', typed, '/orders/7?access_token=q-secret');

    expect(saved.name).toBe('/orders/7?access_token=redacted');
    expect(storage.getItem(HISTORY_STORAGE_KEY)).not.toContain('q-secret');
    expect(storage.getItem(HISTORY_STORAGE_KEY)).not.toContain('f-secret');
  });

  it('stores them when the user asked for credentials to be kept', () => {
    const storage = new MemoryStorage();
    const typed: Draft = { ...draft, query: [{ name: 'access_token', value: 'q-secret' }] };

    new PlaygroundHistory(storage).record(
      { at: 1, route: 'POST /orders', method: 'POST', target: '/orders/7?access_token=q-secret', draft: typed },
      { keepCredentials: true },
    );

    expect(storage.getItem(HISTORY_STORAGE_KEY)).toContain('/orders/7?access_token=q-secret');
  });

  it('does not keep an entry that is too large', () => {
    const history = new PlaygroundHistory(new MemoryStorage());
    const huge: Draft = { ...draft, query: [{ name: 'q', value: 'x'.repeat(MAX_ENTRY) }] };
    const sent = history.record({ at: 1, route: 'POST /orders', method: 'POST', target: '/orders/7', draft: huge });
    const saved = history.save('POST /orders', 'huge', huge, '/orders/7');

    expect(history.has(sent.id)).toBe(false);
    expect(history.has(saved.id)).toBe(false);
    expect(history.recent('POST /orders')).toEqual([]);
    expect(history.saved('POST /orders')).toEqual([]);
  });

  it('stays below its size limit, letting the oldest unsaved entries go first', () => {
    const storage = new MemoryStorage();
    const history = new PlaygroundHistory(storage);
    const large: Draft = { ...draft, query: [{ name: 'q', value: 'x'.repeat(8000) }] };
    const first = history.save('POST /orders', 'kept', large, '/orders/7');

    for (let at = 1; at <= 100; at++) {
      history.record({ at, route: `GET /route-${at}`, method: 'GET', target: '/orders', draft: large });
    }

    expect(storage.getItem(HISTORY_STORAGE_KEY)!.length).toBeLessThanOrEqual(MAX_TOTAL);
    expect(history.has(first.id)).toBe(true);
    expect(history.recent('GET /route-100')).toHaveLength(1);
    expect(history.recent('GET /route-1')).toEqual([]);

    // Saved requests are bounded as well: the oldest go once nothing unsaved is left.
    for (let index = 0; index < 100; index++) {
      history.save('POST /orders', `saved ${index}`, large, '/orders/7');
    }

    expect(storage.getItem(HISTORY_STORAGE_KEY)!.length).toBeLessThanOrEqual(MAX_TOTAL);
    expect(history.has(first.id)).toBe(false);
    expect(history.saved('POST /orders')[0].name).toBe('saved 99');
  });

  it('reads back only entries that are whole', () => {
    const storage = new MemoryStorage();
    const good = send(new PlaygroundHistory(storage), 'POST /orders', 1);

    storage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        good,
        { ...good, id: 'no-target', target: undefined },
        { ...good, id: 'bad-status', status: '200' },
        { ...good, id: 'bad-draft', draft: { ...good.draft, query: [{ name: 'a', value: 1 }] } },
        { ...good, id: 'bad-mode', draft: { ...good.draft, bodyMode: 'xml' } },
        { ...good, id: 'old', draft: { ...good.draft, cookies: [{ name: 'sid', value: '' }] } },
      ]),
    );

    const read = new PlaygroundHistory(storage).recent('POST /orders');

    expect(read.map((entry) => entry.id)).toEqual([good.id, 'old']);
    expect(read[1].draft).toEqual(good.draft);
  });

  it('removes one entry and clears the unsaved ones of a route', () => {
    const history = new PlaygroundHistory(new MemoryStorage());
    const first = send(history, 'POST /orders', 1);
    const saved = history.save('POST /orders', 'kept', draft, '/orders/7');

    send(history, 'POST /orders', 2);
    send(history, 'GET /orders', 3);
    history.remove(first.id);

    expect(history.recent('POST /orders').map((entry) => entry.at)).toEqual([2]);

    history.clear('POST /orders');

    expect(history.recent('POST /orders')).toEqual([]);
    expect(history.saved('POST /orders')).toHaveLength(1);
    expect(history.recent('GET /orders')).toHaveLength(1);

    history.remove(saved.id);

    expect(history.saved('POST /orders')).toEqual([]);
  });

  it('starts empty from storage that holds something else', () => {
    const storage = new MemoryStorage();

    storage.setItem(HISTORY_STORAGE_KEY, '{"not":"a list"}');
    expect(new PlaygroundHistory(storage).recent('POST /orders')).toEqual([]);

    storage.setItem(HISTORY_STORAGE_KEY, 'nope');
    expect(new PlaygroundHistory(storage).recent('POST /orders')).toEqual([]);

    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([null, 4, { id: 'a' }, { id: 'b', route: 'POST /orders', draft: null }]));
    expect(new PlaygroundHistory(storage).recent('POST /orders')).toEqual([]);
  });

  it('keeps working in memory when storage throws', () => {
    const storage = new MemoryStorage();

    storage.fail = true;

    const history = new PlaygroundHistory(storage);

    send(history, 'POST /orders', 1);

    expect(history.recent('POST /orders')).toHaveLength(1);
  });
});
