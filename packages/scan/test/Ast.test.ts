import { describe, expect, it } from 'vitest';
import {
  buildImport,
  extendsSuperClass,
  extractDecoratorArg,
  extractParams,
  getClassNode,
  hasDecorator,
  normalizePath,
} from '../src/Ast';

describe('normalizePath', () => {
  it('removes duplicate slashes and ensures a leading slash', () => {
    expect(normalizePath('/api//foo/')).toBe('/api/foo');
    expect(normalizePath('api/foo')).toBe('/api/foo');
    expect(normalizePath('')).toBe('/');
  });
});

describe('extractParams', () => {
  it('extracts named route parameters', () => {
    expect(extractParams('/users/:id/posts/:postId')).toEqual(['id', 'postId']);
    expect(extractParams('/health')).toEqual([]);
  });
});

describe('buildImport', () => {
  it('chooses default vs named import syntax', () => {
    expect(buildImport('Foo', '#src', true)).toBe(`import Foo from '#src';`);
    expect(buildImport('Foo', '#src', false)).toBe(`import { Foo } from '#src';`);
  });
});

describe('getClassNode', () => {
  it('unwraps export default and named class declarations', () => {
    const defaultExport = getClassNode({
      type: 'ExportDefaultDeclaration',
      declaration: { type: 'ClassDeclaration', id: { name: 'A' } },
    });
    expect(defaultExport).toEqual({ classNode: expect.objectContaining({ id: { name: 'A' } }), isDefault: true });

    const namedExport = getClassNode({
      type: 'ExportNamedDeclaration',
      declaration: { type: 'ClassDeclaration', id: { name: 'B' } },
    });
    expect(namedExport?.isDefault).toBe(false);

    const direct = getClassNode({ type: 'ClassDeclaration', id: { name: 'C' } });
    expect(direct?.classNode.id.name).toBe('C');
  });

  it('returns null for non-class nodes', () => {
    expect(getClassNode({ type: 'ExportDefaultDeclaration', declaration: { type: 'FunctionDeclaration' } })).toBeNull();
    expect(getClassNode({ type: 'VariableDeclaration' })).toBeNull();
  });
});

describe('extractDecoratorArg', () => {
  const decorators = [
    { expression: { type: 'CallExpression', callee: { name: 'Controller' }, arguments: [{ type: 'Literal', value: '/api' }] } },
    { expression: { type: 'CallExpression', callee: { name: 'Other' }, arguments: [] } },
  ];

  it('returns the string argument for a matching decorator', () => {
    expect(extractDecoratorArg(decorators, 'Controller')).toBe('/api');
  });

  it('returns empty string when the decorator has no string argument', () => {
    const noArg = [{ expression: { type: 'CallExpression', callee: { name: 'Controller' }, arguments: [] } }];
    expect(extractDecoratorArg(noArg, 'Controller')).toBe('');
  });

  it('returns null when the decorator is missing', () => {
    expect(extractDecoratorArg(decorators, 'Missing')).toBeNull();
    expect(extractDecoratorArg(undefined, 'Controller')).toBeNull();
  });
});

describe('hasDecorator', () => {
  it('matches call-expression and identifier decorator styles', () => {
    expect(hasDecorator([{ expression: { type: 'CallExpression', callee: { name: 'Injectable' } } }], 'Injectable')).toBe(true);
    expect(hasDecorator([{ expression: { type: 'Identifier', name: 'Injectable' } }], 'Injectable')).toBe(true);
    expect(hasDecorator([{ expression: { type: 'Identifier', name: 'Other' } }], 'Injectable')).toBe(false);
  });
});

describe('extendsSuperClass', () => {
  it('detects a named superclass', () => {
    expect(extendsSuperClass({ superClass: { type: 'Identifier', name: 'BaseMiddleware' } }, 'BaseMiddleware')).toBe(true);
    expect(extendsSuperClass({ superClass: { type: 'Identifier', name: 'Other' } }, 'BaseMiddleware')).toBe(false);
    expect(extendsSuperClass({}, 'BaseMiddleware')).toBe(false);
  });
});
