import { netlify } from '../../dist/index.mjs';
import type { Config } from '@netlify/functions';

export default netlify;

// every path that is not a file in `public`
export const config: Config = { path: '/*', preferStatic: true };
