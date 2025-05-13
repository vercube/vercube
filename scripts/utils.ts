/* eslint-disable unicorn/no-array-reduce */
import { resolve } from 'node:path';

export async function getPackageEntries(cwd: string): Promise<Record<string, string>> {
  const packageJson = await import(resolve(cwd, 'package.json'), { with: { type: 'json' } });

  return Object.entries(packageJson.exports).reduce((acc, [key]) => {
    if (key === '.') {
      acc['main'] = 'src/index.ts';
    } else {
      const path = key.slice(2); // Remove './' and capitalize first letter of each segment
      acc[path] = `src/${path.split('/').map(s => s[0].toUpperCase() + s.slice(1)).join('/')}/*`;
    }
    return acc;
  }, {});
}