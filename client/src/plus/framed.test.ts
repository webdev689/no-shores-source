import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// The kit paints a role's frame and leaves its room to the surface's own sheet (kit.ts). A surface that takes a framed
// role from a sheet that gives it no border width shows no frame at all; this holds every surface to its frame.

const CLIENT = new URL('../../', import.meta.url).pathname;

function filesUnder(folder: string, ending: RegExp): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return filesUnder(path, ending);
    return ending.test(entry.name) ? [path] : [];
  });
}

/** Every class some sheet gives a border width: the page sheets, the .css files and the sheets written in code. */
function classesWithBorders(): Set<string> {
  const code = filesUnder(join(CLIENT, 'src'), /^(?!.*\.test\.ts$).*\.(ts|css)$/);
  const pages = [join(CLIENT, 'index.html'), join(CLIENT, 'testground', 'index.html')];
  const framed = new Set<string>();
  for (const file of [...code, ...pages]) {
    // A sheet written in code fills values in with `${...}`, whose braces would split its rule.
    const sheet = readFileSync(file, 'utf8').replace(/\$\{[^{}]*\}/g, '0');
    for (const [, selectors = '', body = ''] of sheet.matchAll(/([^{}]{1,400})\{([^{}]*)\}/g)) {
      if (!/border(-width)?\s*:\s*[^;]*\d+px/.test(body)) continue;
      for (const [, name = ''] of selectors.matchAll(/\.([a-z][a-z0-9-]*)/g)) framed.add(name);
    }
  }
  return framed;
}

test('every surface that wears a framed role of the kit gives it a border to paint', () => {
  const framed = classesWithBorders();
  const roles = 'panel|window|chip|well|track|tile|button|primary|warn';
  const surface = new RegExp(`\`([a-z][a-z0-9-]*)(?: [a-z0-9-]+)* \\$\\{ROLES\\.(?:${roles})\\}`, 'g');
  const unframed: string[] = [];
  for (const file of filesUnder(join(CLIENT, 'src'), /^(?!.*\.test\.ts$).*\.ts$/)) {
    for (const [, name = ''] of readFileSync(file, 'utf8').matchAll(surface)) {
      if (!framed.has(name)) unframed.push(`${name} (${file.slice(CLIENT.length)})`);
    }
  }
  assert.deepEqual(unframed, []);
});
