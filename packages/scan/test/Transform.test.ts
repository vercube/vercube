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
    expect(resolved[0].import).toBe(`import { Foo } from "/abs/Foo.ts";`);
  });

  it.each([`/home/o'brien/app/C.ts`, '/srv/a$&b/C.ts', `/srv/$'x/C.ts`, '/srv/a$`b/C.ts', String.raw`C:\app\C.ts`])(
    'keeps the path intact and the statement valid for %s',
    (fullPath) => {
      const entries = [{ import: `import { C } from '${IMPORT_SOURCE}';`, importClassName: 'C', fullPath, path: 'C.ts' }];

      const [resolved] = resolveImports(entries, IMPORT_SOURCE);
      expect(resolved.import).toBe(`import { C } from ${JSON.stringify(fullPath)};`);
    },
  );
});
