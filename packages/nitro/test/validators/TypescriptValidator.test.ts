import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateTypescript } from '../../src/validators/TypescriptValidator';

function makeNitro(tsConfig: any) {
  return { options: { typescript: { tsConfig } } } as any;
}

describe('validateTypescript', () => {
  let tmpDir: string;
  let tsConfigPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vercube-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    tsConfigPath = join(tmpDir, 'tsconfig.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('when tsConfig is a string (file path)', () => {
    it('should not throw when experimentalDecorators is true', () => {
      writeFileSync(tsConfigPath, JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
      expect(() => validateTypescript(makeNitro(tsConfigPath))).not.toThrow();
    });

    it('should throw when experimentalDecorators is missing', () => {
      writeFileSync(tsConfigPath, JSON.stringify({ compilerOptions: {} }));
      expect(() => validateTypescript(makeNitro(tsConfigPath))).toThrow(
        'Vercube requires "experimentalDecorators" to be enabled',
      );
    });

    it('should throw when experimentalDecorators is false', () => {
      writeFileSync(tsConfigPath, JSON.stringify({ compilerOptions: { experimentalDecorators: false } }));
      expect(() => validateTypescript(makeNitro(tsConfigPath))).toThrow(
        'Vercube requires "experimentalDecorators" to be enabled',
      );
    });

    it('should throw when compilerOptions is missing', () => {
      writeFileSync(tsConfigPath, JSON.stringify({}));
      expect(() => validateTypescript(makeNitro(tsConfigPath))).toThrow(
        'Vercube requires "experimentalDecorators" to be enabled',
      );
    });

    it('should include the tsconfig path in the error message', () => {
      writeFileSync(tsConfigPath, JSON.stringify({ compilerOptions: {} }));
      expect(() => validateTypescript(makeNitro(tsConfigPath))).toThrow(tsConfigPath);
    });
  });

  describe('when tsConfig is an object', () => {
    it('should add experimentalDecorators to compilerOptions', () => {
      const tsConfig = { compilerOptions: { strict: true } };
      validateTypescript(makeNitro(tsConfig));
      expect(tsConfig.compilerOptions).toMatchObject({ experimentalDecorators: true });
    });

    it('should add compilerOptions with experimentalDecorators if missing', () => {
      const tsConfig: any = {};
      validateTypescript(makeNitro(tsConfig));
      expect(tsConfig.compilerOptions).toMatchObject({ experimentalDecorators: true });
    });

    it('should preserve existing compilerOptions when adding experimentalDecorators', () => {
      const tsConfig = { compilerOptions: { strict: true, target: 'ESNext' } };
      validateTypescript(makeNitro(tsConfig));
      expect(tsConfig.compilerOptions).toMatchObject({
        strict: true,
        target: 'ESNext',
        experimentalDecorators: true,
      });
    });

    it('should not throw', () => {
      const tsConfig = { compilerOptions: {} };
      expect(() => validateTypescript(makeNitro(tsConfig))).not.toThrow();
    });
  });

  describe('when tsConfig is undefined or null', () => {
    it('should not throw when typescript options are undefined', () => {
      expect(() => validateTypescript({ options: { typescript: undefined } } as any)).not.toThrow();
    });

    it('should not throw when tsConfig is undefined', () => {
      expect(() => validateTypescript(makeNitro(undefined))).not.toThrow();
    });

    it('should not throw when tsConfig is null', () => {
      expect(() => validateTypescript(makeNitro(null))).not.toThrow();
    });
  });
});
