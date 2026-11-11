import { describe, expect, it } from 'vitest';
import { flattenConfig, isSecretKey } from '../../src/Utils/Flatten';

describe('Flatten', () => {
  describe('isSecretKey', () => {
    it.each([
      'token',
      'jwt_secret',
      'sessionSecret',
      'auth_token',
      'AWS_SECRET_ACCESS_KEY',
      'access_token_v2',
      'password_hash',
      'apiKeySecondary',
      'x-api-key',
      'connectionString',
      'tokens',
      'session',
      'session:abc',
      'sessionId',
      'sessions',
      'sid',
      'auth',
      'auth:user1',
      'authorization',
      'jwt',
      'cookie',
      'cookies',
      'bearer',
      'signature',
      'passphrase',
      'otp',
      'salt',
    ])('should redact %s', (key) => {
      expect(isSecretKey(key)).toBe(true);
    });

    it.each([
      'keys',
      'key',
      'name',
      'publicKey',
      'monkeys',
      'stripe',
      'port',
      'author',
      'authors',
      'authority',
      'side',
      'consider',
      'salty',
    ])('should keep %s visible', (key) => {
      expect(isSecretKey(key)).toBe(false);
    });
  });

  describe('flattenConfig', () => {
    it('should redact credential-looking leaves anywhere in the path', () => {
      const entries = flattenConfig({
        port: 3000,
        oidc: { jwtSecret: 'super', publicKey: 'visible' },
        providers: [{ api_key: 'nope' }],
        session: { name: 'sid', maxAge: 3600 },
        authorization: 'Bearer abc',
        author: 'Jane',
      });

      expect(entries).toEqual(
        expect.arrayContaining([
          { path: 'port', value: '3000' },
          { path: 'oidc.jwtSecret', value: '<redacted>', redacted: true },
          { path: 'oidc.publicKey', value: 'visible' },
          { path: 'providers.0.api_key', value: '<redacted>', redacted: true },
          { path: 'session', value: '<redacted>', redacted: true },
          { path: 'authorization', value: '<redacted>', redacted: true },
          { path: 'author', value: 'Jane' },
        ]),
      );
    });
  });
});
