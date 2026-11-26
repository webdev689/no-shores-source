// Reads which shader each `createShaderModule(…)` call in a client source names, for `shaders.mjs` to write out. A
// call is read whatever order its descriptor's keys come in; one this cannot read is a problem, never passed over, so
// no shader goes unchecked.

const CALL = /\bcreateShaderModule\s*\(/g;
const NAMED = /^([A-Za-z_]\w*)(\[[^\]]+\])?$/;
const OPEN = '([{';
const CLOSE = ')]}';

/** The text from `from` up to the bracket that closes the one opened just before it, or null if none does. */
function closedFrom(text, from) {
  let depth = 0;
  for (let index = from; index < text.length; index++) {
    const char = text[index] ?? '';
    if (OPEN.includes(char)) depth += 1;
    else if (CLOSE.includes(char)) {
      if (depth === 0) return text.slice(from, index);
      depth -= 1;
    }
  }
  return null;
}

/** The top-level entries of an object literal's text, split at its commas; null when the text is not one. */
function entriesOf(literal) {
  const text = literal.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  const entries = [];
  let [depth, start] = [0, 1];
  for (let index = 1; index < text.length - 1; index++) {
    const char = text[index] ?? '';
    if (OPEN.includes(char)) depth += 1;
    else if (CLOSE.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      entries.push(text.slice(start, index));
      start = index + 1;
    }
  }
  entries.push(text.slice(start, -1));
  return entries.map((entry) => entry.trim()).filter((entry) => entry !== '');
}

/** Each `createShaderModule` call in `text`: its line, and the constant its `code` names (`name`, with a `[pick]`
 *  of a record kept in `code`), or what keeps it from being read (`problem`). */
export function shaderCalls(text) {
  return [...text.matchAll(CALL)].map((call) => {
    const line = text.slice(0, call.index).split('\n').length;
    const argument = closedFrom(text, call.index + call[0].length) ?? '';
    const entry = entriesOf(argument)?.find((each) => /^code\s*:/.test(each));
    const code = entry?.replace(/^code\s*:\s*/, '').trim() ?? argument.trim();
    const [, name] = NAMED.exec(entry === undefined ? '' : code) ?? [];
    return name
      ? { line, name, code }
      : { line, problem: `the shader's code (${code}) is not a constant this can read` };
  });
}
