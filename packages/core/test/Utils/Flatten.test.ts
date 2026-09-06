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
    ])('should redact %s', (key) => {
      expect(isSecretKey(key)).toBe(true);
    });

    it.each(['keys', 'key', 'name', 'publicKey', 'monkeys', 'stripe', 'port'])('should keep %s visible', (key) => {
      expect(isSecretKey(key)).toBe(false);
    });
  });

  describe('flattenConfig', () => {
    it('should redact credential-looking leaves anywhere in the path', () => {
      const entries = flattenConfig({
        port: 3000,
        auth: { jwtSecret: 'super', publicKey: 'visible' },
        providers: [{ api_key: 'nope' }],
      });

      expect(entries).toEqual(
        expect.arrayContaining([
          { path: 'port', value: '3000' },
          { path: 'auth.jwtSecret', value: '<redacted>', redacted: true },
          { path: 'auth.publicKey', value: 'visible' },
          { path: 'providers.0.api_key', value: '<redacted>', redacted: true },
        ]),
      );
    });
  });
});
