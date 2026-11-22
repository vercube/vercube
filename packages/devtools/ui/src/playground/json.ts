/**
 * Pretty printing of a JSON response body.
 *
 * `JSON.stringify(JSON.parse(text))` shows a different document than the one
 * that arrived: an integer above 2^53 is rounded, `1.0` becomes `1`, and of
 * two members with the same name only the last survives. An inspector must
 * show what the server sent, so the text is re-indented instead. Every token
 * is copied as it was written and only the blanks between tokens change.
 */

/** Characters JSON allows between tokens. */
const BLANK: ReadonlySet<string> = new Set([' ', '\t', '\n', '\r']);

/**
 * Finds the end of a string token.
 *
 * @param text - The document
 * @param start - Index of the opening quote
 * @returns The index after the closing quote, or the length of the text when it never closes
 */
function endOfString(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
    } else if (text[index] === '"') {
      return index + 1;
    } else {
      index++;
    }
  }

  return text.length;
}

/**
 * Finds the next character that is not a blank.
 *
 * @param text - The document
 * @param start - Where to look from
 * @returns Its index, or the length of the text
 */
function skipBlanks(text: string, start: number): number {
  let index = start;

  while (index < text.length && BLANK.has(text[index])) {
    index++;
  }

  return index;
}

/**
 * Re-indents a JSON document without changing any of its values.
 *
 * @param text - The document as it was received
 * @param indent - Spaces per level
 * @returns The same document with one member per line, or the text unchanged when it is not valid JSON
 */
export function formatJson(text: string, indent: number = 2): string {
  try {
    // Only to learn whether the text is JSON. The parsed value is not used.
    JSON.parse(text);
  } catch {
    return text;
  }

  const out: string[] = [];
  let depth = 0;
  let index = skipBlanks(text, 0);

  /**
   * Starts a new line at the current depth.
   */
  const line = (): void => {
    out.push('\n', ' '.repeat(depth * indent));
  };

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      const end = endOfString(text, index);

      out.push(text.slice(index, end));
      index = end;
    } else if (char === '{' || char === '[') {
      const next = skipBlanks(text, index + 1);

      // An empty object or array stays on its line.
      if (text[next] === (char === '{' ? '}' : ']')) {
        out.push(char, text[next]);
        index = next + 1;
      } else {
        depth++;
        out.push(char);
        line();
        index++;
      }
    } else if (char === '}' || char === ']') {
      depth--;
      line();
      out.push(char);
      index++;
    } else if (char === ',') {
      out.push(char);
      line();
      index++;
    } else if (char === ':') {
      out.push(': ');
      index++;
    } else {
      // A number, `true`, `false` or `null`: copied up to the next delimiter.
      let end = index;

      while (end < text.length && !BLANK.has(text[end]) && !',:]}'.includes(text[end])) {
        end++;
      }

      out.push(text.slice(index, end));
      index = end;
    }

    index = skipBlanks(text, index);
  }

  return out.join('');
}
