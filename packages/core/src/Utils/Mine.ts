export const mime = {
  getType(ext: string): string | null {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.wasm': 'application/wasm',
      // Add more as needed
    };
    return types[ext] || null;
  },
};

/** Content types of files an application sends itself, by lower-case extension. */
const FILE_TYPES: Record<string, string> = Object.assign(Object.create(null), {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json',
  ndjson: 'application/x-ndjson',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  xml: 'application/xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
});

/**
 * The content type of a file by the extension of its name. Text types carry
 * `charset=utf-8`, so a browser does not guess the encoding of a download.
 *
 * @param {string} [filename] - A file name or path
 * @returns {string | undefined} The content type, undefined for an unknown or missing extension
 */
export function getFileContentType(filename?: string): string | undefined {
  const dot = filename ? filename.lastIndexOf('.') : -1;

  return dot === -1 ? undefined : FILE_TYPES[filename!.slice(dot + 1).toLowerCase()];
}
