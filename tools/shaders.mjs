// Writes out every shader the client compiles, one WGSL file each into target/shaders/, for `cargo xtask check` to
// validate before any browser runs them (WebGPU reports a shader that fails to compile only as a warning). A shader's
// code is the constant each `createShaderModule({ code: … })` names, exported where it is made: a string, or a record
// of strings picked by a key. A call this cannot read is a problem, so no shader goes unchecked.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CLIENT = 'client';
const OUT = join('target', 'shaders');
const CALL = /createShaderModule\(\s*\{\s*code:\s*([^,}\n]+?)\s*[,}]/g;
const NAMED = /^([A-Za-z_]\w*)(\[[^\]]+\])?$/;

const sources = (folder) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });

/** The file that exports `name` to `file`: the file itself, or the one it imports `name` from. */
function exporterOf(file, text, name) {
  if (new RegExp(`export const ${name}\\b`).test(text)) return file;
  for (const [, names, from] of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g))
    if (names.split(',').some((each) => each.trim() === name)) return resolve(dirname(file), from);
  return null;
}

const problems = [];
const shaders = new Map();
for (const file of sources(CLIENT)) {
  const text = readFileSync(file, 'utf8');
  for (const call of text.matchAll(CALL)) {
    const line = text.slice(0, call.index).split('\n').length;
    const [, name] = NAMED.exec(call[1]) ?? [];
    const exporter = name ? exporterOf(file, text, name) : null;
    if (!name || !exporter) {
      problems.push(`${file}:${line}: the shader's code (${call[1]}) is not an exported constant this can read`);
      continue;
    }
    shaders.set(`${relative(CLIENT, exporter)}#${name}`, { exporter, name, at: `${file}:${line}` });
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const [key, { exporter, name, at }] of shaders) {
  const value = (await import(pathToFileURL(exporter).href))[name];
  const sets = typeof value === 'string' ? { '': value } : value;
  const strings = Object.entries(sets ?? {}).filter(([, code]) => typeof code === 'string');
  if (strings.length === 0 || strings.length !== Object.keys(sets ?? {}).length) {
    problems.push(`${at}: ${key} is neither a string nor a record of strings`);
    continue;
  }
  for (const [pick, code] of strings)
    writeFileSync(join(OUT, `${key.replace(/[/#]/g, '_')}${pick ? `.${pick}` : ''}.wgsl`), code);
}

if (problems.length > 0) {
  for (const problem of problems) console.log(problem);
  process.exit(1);
}
console.log(`${readdirSync(OUT).length} shaders written to ${OUT}`);
