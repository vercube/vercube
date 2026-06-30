import { describe, expect, it, vi } from 'vitest';

const serveStatic = vi.hoisted(() => vi.fn(() => 'static-middleware'));

vi.mock('srvx/static', () => ({
  serveStatic,
}));

import { serveStaticFiles } from '../../src/Common/ServeStatic';

describe('serveStaticFiles', () => {
  it('registers srvx static middleware on the server', () => {
    const server = { options: {} as { middleware?: unknown[] } };
    serveStaticFiles('/abs/public')(server as any);

    expect(serveStatic).toHaveBeenCalledWith({ dir: '/abs/public' });
    expect(server.options.middleware).toEqual(['static-middleware']);
  });

  it('appends to an existing middleware stack', () => {
    const server = { options: { middleware: ['existing'] as unknown[] } };
    serveStaticFiles('/abs/public')(server as any);

    expect(server.options.middleware).toEqual(['existing', 'static-middleware']);
  });
});
