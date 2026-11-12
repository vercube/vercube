import { describe, expect, it } from 'vitest';
import { getRequestIP } from '../../src';

/** A request as srvx hands it over, with the socket address on `ip`. */
function request(ip: string | undefined, forwarded?: string): Request {
  const req = new Request('http://localhost/', forwarded ? { headers: { 'x-forwarded-for': forwarded } } : undefined);

  return Object.assign(req, { ip });
}

describe('getRequestIP', () => {
  it('should return the socket address and ignore headers by default', () => {
    expect(getRequestIP(request('10.0.0.1', '1.2.3.4'))).toBe('10.0.0.1');
    expect(getRequestIP(request('10.0.0.1', '1.2.3.4'), { trustProxy: false })).toBe('10.0.0.1');
    expect(getRequestIP(request('10.0.0.1', '1.2.3.4'), { trustProxy: 0 })).toBe('10.0.0.1');
  });

  it('should return null when nothing tells the address', () => {
    expect(getRequestIP(new Request('http://localhost/'))).toBeNull();
    expect(getRequestIP(request('  '))).toBeNull();
    expect(getRequestIP(request(undefined), { trustProxy: 1 })).toBeNull();
  });

  it('should strip the IPv4-mapped IPv6 prefix', () => {
    expect(getRequestIP(request('::ffff:127.0.0.1'))).toBe('127.0.0.1');
    expect(getRequestIP(request('::1'))).toBe('::1');
  });

  it('should count trusted hops from the right, so a client cannot spoof the address', () => {
    // the client wrote 6.6.6.6 itself, the load balancer appended the real address
    const spoofed = request('10.0.0.1', '6.6.6.6, 203.0.113.7');

    expect(getRequestIP(spoofed, { trustProxy: 1 })).toBe('203.0.113.7');
    expect(getRequestIP(request('10.0.0.1', '203.0.113.7, 10.0.0.2'), { trustProxy: 2 })).toBe('203.0.113.7');
  });

  it('should fall back to the leftmost entry when there are fewer entries than trusted hops', () => {
    expect(getRequestIP(request('10.0.0.1', '203.0.113.7'), { trustProxy: 3 })).toBe('203.0.113.7');
  });

  it('should take the leftmost entry when every proxy is trusted', () => {
    expect(getRequestIP(request('10.0.0.1', ' 203.0.113.7 , ,10.0.0.2'), { trustProxy: true })).toBe('203.0.113.7');
  });

  it('should fall back to the socket address when the header is missing or empty', () => {
    expect(getRequestIP(request('10.0.0.1'), { trustProxy: 1 })).toBe('10.0.0.1');
    expect(getRequestIP(request('10.0.0.1', ' , '), { trustProxy: true })).toBe('10.0.0.1');
  });
});
