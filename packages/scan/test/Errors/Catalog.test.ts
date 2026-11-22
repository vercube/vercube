import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScanErrors } from '../../src/Errors/Catalog';
import { inspectEntry } from '../../src/Typegen';

type Described = Error & { code?: string; why?: string; fix?: string; link?: string };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vercube-scan-errors-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function rejected(run: () => Promise<unknown>): Promise<Described> {
  try {
    await run();
  } catch (error) {
    return error as Described;
  }

  throw new Error('nothing was thrown');
}

describe('the errors of the scanner', () => {
  it('describes an entry that fails while it is inspected', async () => {
    writeFileSync(join(root, 'entry.mjs'), 'process.exit(3);\n');

    const error = await rejected(() => inspectEntry(join(root, 'entry.mjs'), [], root));

    expect(error.constructor).toBe(Error);
    expect(error.message).toBe('Inspect exited with code 3');
    expect(error.code).toBe('VERCUBE_SCAN_INSPECT_FAILED');
    expect(error.why).toContain('child process');
    expect(error.fix).toContain('node dist/index.mjs');
    expect(error.link).toBe('https://vercube.dev/docs/core-features/errors#vercube_scan_inspect_failed');
    // attached out of sight: what is printed or serialised stays the same
    expect(Object.keys(error)).toEqual([]);
  });

  it('describes an entry that does not answer in time', async () => {
    writeFileSync(join(root, 'entry.mjs'), 'setInterval(() => {}, 1000);\n');

    const error = await rejected(() => inspectEntry(join(root, 'entry.mjs'), [], root, 200));

    expect(error.constructor).toBe(Error);
    expect(error.message).toBe('Inspect did not finish within 0.2s');
    expect(error.code).toBe('VERCUBE_SCAN_INSPECT_TIMEOUT');
  });

  it('lists its errors the way a catalog of the framework does', () => {
    expect(ScanErrors.prefix).toBe('VERCUBE_SCAN');
    expect(ScanErrors.describe().map((entry) => [entry.code, entry.message])).toEqual([
      ['VERCUBE_SCAN_INSPECT_TIMEOUT', 'Inspect did not finish within <seconds>s'],
      ['VERCUBE_SCAN_INSPECT_FAILED', 'Inspect exited with code <code>'],
    ]);
  });
});
