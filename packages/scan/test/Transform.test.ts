import { describe, expect, it } from 'vitest';
import { IMPORT_SOURCE } from '../src/Extract';
import { resolveImports } from '../src/Transform';

describe('resolveImports', () => {
  it('replaces the placeholder import source with the real file path', () => {
    const entries = [
      {
        import: `import { Foo } from '${IMPORT_SOURCE}';`,
        importClassName: 'Foo',
        fullPath: '/abs/Foo.ts',
        path: 'Foo.ts',
      },
    ];

    const resolved = resolveImports(entries, IMPORT_SOURCE);
    expect(resolved[0].import).toBe(`import { Foo } from '/abs/Foo.ts';`);
  });
});
