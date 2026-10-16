import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../src/Errors/Http/BadRequestError';
import { PayloadTooLargeError } from '../../src/Errors/Http/PayloadTooLargeError';
import { UnsupportedMediaTypeError } from '../../src/Errors/Http/UnsupportedMediaTypeError';
import { resolveMultipartFormData } from '../../src/Resolvers/MultipartFormData';
import type { RouterTypes } from '../../src/Types/RouterTypes';

const event = (request: Request, bodyLimit?: number): RouterTypes.RouterEvent =>
  ({ request, response: new Response(), data: {} as RouterTypes.RouterHandler, bodyLimit }) as RouterTypes.RouterEvent;

const upload = (form: FormData, headers?: Record<string, string>): Request =>
  new Request('http://localhost/upload', { method: 'POST', body: form, headers });

describe('resolveMultipartFormData', () => {
  it('should resolve text fields, files and repeated fields', async () => {
    const form = new FormData();
    form.append('title', 'hello');
    form.append('tag', 'a');
    form.append('tag', 'b');
    form.append('__proto__', 'x');
    form.append('file', new File(['content'], 'a.txt', { type: 'text/plain' }));

    const result = await resolveMultipartFormData(event(upload(form)));

    expect(result?.title).toBe('hello');
    expect(result?.tag).toEqual(['a', 'b']);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result?.file).toBeInstanceOf(File);
    expect(await (result!.file as File).text()).toBe('content');
  });

  it('should resolve undefined without a body', async () => {
    await expect(resolveMultipartFormData(event(new Request('http://localhost/upload')))).resolves.toBeUndefined();
  });

  it('should reject another content type with 415', async () => {
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });

    await expect(resolveMultipartFormData(event(request))).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
  });

  it('should reject a malformed body with 400', async () => {
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: 'garbage',
      headers: { 'content-type': 'multipart/form-data; boundary=nope' },
    });

    await expect(resolveMultipartFormData(event(request))).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should enforce the body limit with and without a declared length', async () => {
    const form = new FormData();
    form.append('file', new File(['x'.repeat(1000)], 'a.txt'));

    await expect(resolveMultipartFormData(event(upload(form), 100))).rejects.toBeInstanceOf(PayloadTooLargeError);
    await expect(resolveMultipartFormData(event(upload(form, { 'content-length': '5000' }), 100))).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it('should read a body within the limit', async () => {
    const form = new FormData();
    form.append('title', 'hello');

    await expect(resolveMultipartFormData(event(upload(form), 10_000))).resolves.toEqual({ title: 'hello' });
  });

  it('should read a body with a declared length within the limit', async () => {
    const form = new FormData();
    form.append('title', 'hello');
    const request = upload(form);
    const length = String((await request.clone().arrayBuffer()).byteLength);
    const declared = new Request(request, {
      headers: { 'content-type': request.headers.get('content-type')!, 'content-length': length },
    });

    await expect(resolveMultipartFormData(event(declared, 10_000))).resolves.toEqual({ title: 'hello' });
  });
});
