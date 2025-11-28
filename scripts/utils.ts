import { resolve } from 'node:path';

export async function getPackageJson(cwd: string): Promise<Record<string, string>> {
  return (
    await import(resolve(cwd, 'package.json'), {
      with: { type: 'json' },
    })
  ).default;
}

export async function getPackageEntries(cwd: string): Promise<Record<string, string>> {
  const packageJson = await getPackageJson(cwd);

  const acc: Record<string, string> = {};

  for (const [key] of Object.entries(packageJson.exports)) {
    if (key === '.') {
      acc['main'] = 'src/index.ts';
    } else {
      const path = key.slice(2); // Remove './' and capitalize first letter of each segment
      acc[path] = `src/${path
        .split('/')
        .map((s) => s[0].toUpperCase() + s.slice(1))
        .join('/')}/*`;
    }
  }
  return acc;
}

export function toKebabCase(str: string) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function transformExports(exports: Record<string, string>): Record<string, string> {
  for (const [key, value] of Object.entries(exports)) {
    exports[toKebabCase(key)] = value;

    if (key !== toKebabCase(key)) {
      delete exports[key];
    }
  }

  return exports;
}
