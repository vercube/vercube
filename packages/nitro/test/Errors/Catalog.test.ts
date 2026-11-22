import { getErrorGuidance } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { resolveNitroHealth } from '../../src/_internal/health';
import { validateBundler } from '../../src/validators/BundlerValidator';

function thrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }

  throw new Error('nothing was thrown');
}

describe('the errors of the Nitro module', () => {
  it('describes a builder other than rolldown', () => {
    const error = thrown(() => validateBundler({ options: { builder: 'rollup' } } as any));

    expect(error.constructor).toBe(Error);
    expect(error.message).toBe('Vercube Nitro module requires the rolldown builder');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_NITRO_BUILDER_NOT_ROLLDOWN');
    expect(getErrorGuidance(error)?.fix).toBe("Set `builder: 'rolldown'` in `nitro.config.ts`.");
  });

  it('describes health options that cannot go through the build', () => {
    const token = thrown(() => resolveNitroHealth({ token: 'secret' } as any));

    expect(token.constructor).toBe(Error);
    expect(token.message).toBe(
      'vercubeNitro: health.token would be baked into the server build. Set runtimeConfig.vercube.healthToken instead (NITRO_VERCUBE_HEALTH_TOKEN at runtime).',
    );
    expect(getErrorGuidance(token)?.code).toBe('VERCUBE_NITRO_HEALTH_TOKEN_IN_BUILD');
    // the token itself is nowhere on the error
    expect(JSON.stringify([token.message, getErrorGuidance(token)])).not.toContain('secret');

    const checks = thrown(() => resolveNitroHealth({ checks: {} } as any));

    expect(checks.message).toBe(
      'vercubeNitro: health.checks cannot be passed through the build. Register them with app.health.register() in the setupFile.',
    );
    expect(getErrorGuidance(checks)?.code).toBe('VERCUBE_NITRO_HEALTH_CHECKS_IN_BUILD');
  });
});
