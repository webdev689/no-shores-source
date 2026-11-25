/** What the Land mode reads of a key press. */
type KeyPress = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'getModifierState'>;

/** The keys the walker and the Sloop take, lower-cased, while the Land mode walks or sails. */
export const MOVING_KEYS: readonly string[] = [
  'w',
  'a',
  's',
  'd',
  'shift',
  'c',
  'f',
  'x',
  ' ',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
];

/** The key a press gives the Land mode's tools and switches, lower-cased; Ctrl+Z and Ctrl+Y (Cmd on a Mac) come as
 *  'undo' and 'redo'. Any other press with Ctrl or Cmd held is the browser's own shortcut (Ctrl+L, Cmd+1), so it
 *  gives null and chooses no tool, as does Alt with a letter, a digit or a named key (Alt+D, Alt+Left). Some layouts
 *  type `[` and `]` through AltGr, which comes as Ctrl and Alt held, or through a Mac's Option, which comes as Alt
 *  alone, so a sign typed either way is typing. */
export function landKey(press: KeyPress): string | null {
  const key = press.key.toLowerCase();
  if (press.getModifierState('AltGraph')) return key;
  const command = press.ctrlKey || press.metaKey;
  if (command && key === 'z') return press.shiftKey ? 'redo' : 'undo';
  if (command && key === 'y') return 'redo';
  if (command) return null;
  return press.altKey && (key.length > 1 || /^[a-z0-9]$/.test(key)) ? null : key;
}
