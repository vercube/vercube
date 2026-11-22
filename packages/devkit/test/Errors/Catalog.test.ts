import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getErrorGuidance } from '@vercube/core';
import { createHooks } from 'hookable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { typegen } from '../../src/Typegen/Typegen';
import type { DevKitTypes } from '../../src/Types/DevKitTypes';

vi.mock('consola', () => ({ default: { warn: vi.fn(), success: vi.fn() } }));

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `vercube-devkit-errors-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, 'dist'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the errors of the devkit', () => {
  it('describes an application that reports no routes', async () => {
    // a built entry that answers the inspection without a `routes` section
    writeFileSync(
      join(root, 'dist/index.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.VERCUBE_INSPECT_OUT, JSON.stringify({}));\n`,
    );

    const app = { hooks: createHooks(), config: { build: { root, typegen: true } } } as DevKitTypes.App;
    const error = await typegen(app).then(
      () => undefined,
      (error_: Error) => error_,
    );

    expect(error).toBeInstanceOf(TypeError);
    expect(error!.message).toBe('The application did not report its routes');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_DEVKIT_ROUTES_NOT_REPORTED');
    expect(getErrorGuidance(error)?.fix).toContain('build.typegen');
  });
});
