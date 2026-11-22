/**
 * Merges two `Vary` header values, keeping each token once.
 *
 * @param {string} target - The value of the response being sent
 * @param {string} source - The value set on the intermediate response
 * @returns {string} The merged value, `*` when either side varies on everything
 */
export function mergeVary(target: string, source: string): string {
  const tokens = target
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const seen = new Set(tokens.map((token) => token.toLowerCase()));

  for (const raw of source.split(',')) {
    const token = raw.trim();

    if (token && !seen.has(token.toLowerCase())) {
      seen.add(token.toLowerCase());
      tokens.push(token);
    }
  }

  return seen.has('*') ? '*' : tokens.join(', ');
}

/**
 * Content types worth compressing: text, and the structured formats that are
 * text underneath. Images, video, audio, archives and fonts in `woff` are
 * compressed already.
 */
const COMPRESSIBLE =
  /^(?:text\/|application\/(?:json|javascript|xml|x-ndjson|ndjson|graphql|wasm|x-www-form-urlencoded|x-javascript|ecmascript|rtf|x-font-ttf|vnd\.ms-fontobject|x-yaml|yaml|toml)\b|image\/(?:svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)|font\/(?:ttf|otf)|[a-z]+\/[\w.-]+\+(?:json|xml|text|yaml)\b)/i;

/**
 * Whether a content type is worth compressing.
 *
 * @param {string | null | undefined} type - The `Content-Type` of a response
 * @returns {boolean} True for text and the formats that are text underneath
 */
export function isCompressible(type: string | null | undefined): boolean {
  return !!type && COMPRESSIBLE.test(type);
}
