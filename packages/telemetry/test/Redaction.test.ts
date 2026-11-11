import { describe, expect, it } from 'vitest';
import { redactBody } from '../src/Common/BodyCapture';
import { redactJson, redactQuery } from '../src/Common/Redaction';

describe('redactJson', () => {
  it('returns the text untouched when no key is secret', () => {
    const text = '{ "hi": true,\n  "list": [1, 2] }';

    expect(redactJson(text)).toBe(text);
  });

  it('masks string, number and null values under secret keys', () => {
    expect(redactJson('{"password":"p","otp":123456,"token":null,"name":"ann"}')).toBe(
      '{"password":"<redacted>","otp":"<redacted>","token":"<redacted>","name":"ann"}',
    );
  });

  it('masks nested keys and keys inside arrays', () => {
    expect(redactJson('{"user":{"accessToken":"t"},"items":[{"apiKey":"k"}]}')).toBe(
      '{"user":{"accessToken":"<redacted>"},"items":[{"apiKey":"<redacted>"}]}',
    );
  });

  it('masks a whole object or array under a secret key', () => {
    expect(redactJson('{"credentials":{"user":"a","pin":"1"},"tokens":["a","b"],"ok":1}')).toBe(
      '{"credentials":"<redacted>","tokens":"<redacted>","ok":1}',
    );
  });

  it('keeps formatting around a masked value', () => {
    expect(redactJson('{\n  "password" :  "p",\n  "a": 1\n}')).toBe('{\n  "password" :  "<redacted>",\n  "a": 1\n}');
  });

  it('does not treat a secret-looking string value as a key', () => {
    const text = String.raw`{"label":"password","note":"say \"token\": no","list":["secret"]}`;

    expect(redactJson(text)).toBe(text);
  });

  it('decodes escaped keys before matching', () => {
    expect(redactJson(String.raw`{"pass\u0077ord":"p"}`)).toBe(String.raw`{"pass\u0077ord":"<redacted>"}`);
  });

  it('masks a value cut off by truncation', () => {
    expect(redactJson('{"a":1,"password":"hun')).toBe('{"a":1,"password":"<redacted>"');
    expect(redactJson('{"a":1,"credentials":{"user":"ann","pi')).toBe('{"a":1,"credentials":"<redacted>"');
    expect(redactJson('{"a":1,"otp":12')).toBe('{"a":1,"otp":"<redacted>"');
  });

  it('leaves a secret key whose value has not started yet', () => {
    expect(redactJson('{"a":1,"password":')).toBe('{"a":1,"password":');
  });
});

describe('redactQuery', () => {
  it('masks secret fields and leaves the rest byte-identical when none match', () => {
    expect(redactQuery('a=1&client_secret=s')).toBe('a=1&client_secret=%3Credacted%3E');
    expect(redactQuery('a=1&b=hello+world')).toBe('a=1&b=hello+world');
  });
});

describe('redactBody', () => {
  it('picks the masking by content type', () => {
    expect(redactBody('{"token":"t"}', 'application/vnd.api+json; charset=utf-8')).toBe('{"token":"<redacted>"}');
    expect(redactBody('password=p', 'application/x-www-form-urlencoded')).toBe('password=%3Credacted%3E');
    expect(redactBody('{"token":"t"}', 'text/plain')).toBe('{"token":"t"}');
  });

  it('treats an untyped body as JSON only when it looks like JSON', () => {
    expect(redactBody(' {"token":"t"}', null)).toBe(' {"token":"<redacted>"}');
    expect(redactBody('token: t', null)).toBe('token: t');
  });
});
