import { describe, expect, it } from 'vitest';
import { validateBundler } from '../../src/validators/BundlerValidator';

function makeNitro(builder: string) {
  return { options: { builder } } as any;
}

describe('validateBundler', () => {
  it('should not throw when builder is rolldown', () => {
    expect(() => validateBundler(makeNitro('rolldown'))).not.toThrow();
  });

  it('should throw when builder is not rolldown', () => {
    expect(() => validateBundler(makeNitro('webpack'))).toThrow('Vercube Nitro module requires the rolldown builder');
  });

  it('should throw when builder is vite', () => {
    expect(() => validateBundler(makeNitro('vite'))).toThrow('Vercube Nitro module requires the rolldown builder');
  });

  it('should throw when builder is empty string', () => {
    expect(() => validateBundler(makeNitro(''))).toThrow('Vercube Nitro module requires the rolldown builder');
  });
});
