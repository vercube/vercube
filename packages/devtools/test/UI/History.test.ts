import { afterEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_STORAGE_KEY, PlaygroundHistory, sanitiseDraft } from '../../ui/src/playground/history';
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
  cookies: [{ name: 'sid', value: 's1' }],
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
  it('removes the values of headers that look like credentials, and of every cookie', () => {
    const stored = sanitiseDraft(draft);

    expect(stored.headers).toEqual([
      { name: 'x-tenant', value: 'acme' },
      { name: 'Authorization', value: '' },
      { name: 'X-Api-Key', value: '' },
      { name: 'x-session-id', value: '' },
    ]);
    expect(stored.cookies).toEqual([{ name: 'sid', value: '' }]);
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
