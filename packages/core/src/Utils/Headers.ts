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
