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
 *  'undo' and 'redo'. Any other press with Ctrl, Cmd or Alt held is the browser's own shortcut (Ctrl+L, Cmd+1), so
 *  it gives null and chooses no tool. AltGr comes as Ctrl and Alt held, and some layouts type `[` and `]` with it, so
 *  a key typed through it is typing. */
export function landKey(press: KeyPress): string | null {
  const key = press.key.toLowerCase();
  if (press.getModifierState('AltGraph')) return key;
  const command = press.ctrlKey || press.metaKey;
  if (command && key === 'z') return press.shiftKey ? 'redo' : 'undo';
  if (command && key === 'y') return 'redo';
  return command || press.altKey ? null : key;
}
