import { describe, expect, it } from 'vitest';
import { createSseParser } from '../../ui/src/playground/sse';

describe('createSseParser', () => {
  it('parses a named event with an id', () => {
    const parse = createSseParser();

    expect(parse('event: tick\nid: 4\ndata: {"n":1}\n\n')).toEqual([
      { event: 'tick', data: '{"n":1}', id: '4', retry: undefined },
    ]);
  });

  it('calls an unnamed event `message` and joins data lines', () => {
    expect(createSseParser()('data: one\ndata: two\n\n')).toEqual([
      { event: 'message', data: 'one\ntwo', id: undefined, retry: undefined },
    ]);
  });

  it('waits for the blank line across chunks', () => {
    const parse = createSseParser();

    expect(parse('data: hel')).toEqual([]);
    expect(parse('lo\n')).toEqual([]);
    expect(parse('\ndata: next\n\n')).toEqual([
      { event: 'message', data: 'hello', id: undefined, retry: undefined },
      { event: 'message', data: 'next', id: undefined, retry: undefined },
    ]);
  });

  it('accepts CRLF and CR line ends, split anywhere', () => {
    const parse = createSseParser();

    expect(parse('data: a\r')).toEqual([]);
    expect(parse('\n\r\ndata: b\r\rdata: c\r\n\r\n')).toEqual([
      { event: 'message', data: 'a', id: undefined, retry: undefined },
      { event: 'message', data: 'b', id: undefined, retry: undefined },
      { event: 'message', data: 'c', id: undefined, retry: undefined },
    ]);
  });

  it('skips comments and heartbeats', () => {
    expect(createSseParser()(': keep-alive\n\n: again\n\ndata: x\n\n')).toEqual([
      { event: 'message', data: 'x', id: undefined, retry: undefined },
    ]);
  });

  it('reports a block that only sets the retry delay', () => {
    expect(createSseParser()('retry: 3000\n\n')).toEqual([{ event: 'message', data: '', id: undefined, retry: 3000 }]);
    expect(createSseParser()('retry: soon\n\n')).toEqual([]);
  });

  it('keeps the last id for the events that follow', () => {
    const parse = createSseParser();

    expect(parse('id: 7\ndata: a\n\ndata: b\n\n').map((event) => event.id)).toEqual(['7', '7']);
  });

  it('strips one leading space only, and reads a line without a colon as a field', () => {
    expect(createSseParser()('data:  two spaces\ndata\n\n')[0].data).toBe(' two spaces\n');
  });

  it('ignores fields it does not know', () => {
    expect(createSseParser()('custom: 1\ndata: x\n\n')).toHaveLength(1);
  });
});
