// The forge viewer's choice in the page's address: the page writes it there so a look can be sent, and reads it back
// whenever the address changes, so a sent look opens as sent even in a page already open. No page in it: node runs it
// too (forgeviewer.test.js).

/** `over` laid on `base`, key by key; a key `base` lacks is kept as `over` has it. */
export const mergeChoice = (base, over) => (over && typeof over === 'object' && !Array.isArray(over) && typeof base === 'object' && !Array.isArray(base)
  ? Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(over)])].map((k) => [k, k in base ? mergeChoice(base[k], over[k]) : over[k]]))
  : (over ?? base));

/** The choice an address's hash names over `base`, a copy; `base` itself where the hash does not read. */
export function choiceOfHash(hash, base) {
  try {
    return structuredClone(mergeChoice(base, JSON.parse(decodeURIComponent(String(hash ?? '').replace(/^#/, '')) || '{}')));
  } catch {
    return structuredClone(base);
  }
}

/** The hash that names `choice`, leaving out what is never sent (`playing`). */
export const hashOfChoice = (choice) => `#${encodeURIComponent(JSON.stringify(choice, (key, value) => (key === 'playing' ? undefined : value)))}`;
