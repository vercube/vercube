import { timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('[auth] Timing-safe authentication', () => {
  it('should use timingSafeEqual for password comparison', () => {
    const password1 = 'test';
    const password2 = 'test';

    // Convert to buffers for timing-safe comparison
    const buf1 = Buffer.from(password1);
    const buf2 = Buffer.from(password2);

    // This should not throw
    expect(() => timingSafeEqual(buf1, buf2)).not.toThrow();
    expect(timingSafeEqual(buf1, buf2)).toBe(true);
  });

  it('should correctly detect mismatched passwords using timingSafeEqual', () => {
    const password1 = 'test';
    const password2 = 'fail'; // Same length as 'test'

    // Convert to buffers for timing-safe comparison
    const buf1 = Buffer.from(password1);
    const buf2 = Buffer.from(password2);

    expect(timingSafeEqual(buf1, buf2)).toBe(false);
  });

  it('should handle different length strings safely', () => {
    const password1 = 'test';
    const password2 = 'testing';

    // timingSafeEqual requires same length buffers
    // So we need to check length first
    const lengthMatches = password1.length === password2.length;

    expect(lengthMatches).toBe(false);

    // Only compare if lengths match
    if (lengthMatches) {
      const buf1 = Buffer.from(password1);
      const buf2 = Buffer.from(password2);
      timingSafeEqual(buf1, buf2);
    }
  });

  it('should prevent timing attacks by using constant-time comparison', () => {
    // This test demonstrates the proper way to compare sensitive values
    const authenticateUser = (providedUser: string, providedPass: string): boolean => {
      const expectedUser = 'admin';
      const expectedPass = 'secret123';

      // Check lengths first (this is not constant-time, but necessary for timingSafeEqual)
      const userLengthMatches = providedUser.length === expectedUser.length;
      const passLengthMatches = providedPass.length === expectedPass.length;

      // Use timing-safe comparison for actual values
      const userMatches = userLengthMatches && timingSafeEqual(Buffer.from(providedUser), Buffer.from(expectedUser));
      const passMatches = passLengthMatches && timingSafeEqual(Buffer.from(providedPass), Buffer.from(expectedPass));

      return userMatches && passMatches;
    };

    // Valid credentials
    expect(authenticateUser('admin', 'secret123')).toBe(true);

    // Invalid username
    expect(authenticateUser('user', 'secret123')).toBe(false);

    // Invalid password
    expect(authenticateUser('admin', 'wrong')).toBe(false);

    // Both invalid
    expect(authenticateUser('user', 'wrong')).toBe(false);

    // Different lengths
    expect(authenticateUser('administrator', 'secret123')).toBe(false);
    expect(authenticateUser('admin', 'secret')).toBe(false);
  });
});
