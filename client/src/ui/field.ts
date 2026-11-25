// A text field's words and where its caret stands, and every edit typing makes to them: plain data and functions, so
// the field is the same whether keys, a paste or the browser's own typing (`EditContext`) drive it. Places are UTF-16
// offsets, as the browser counts them.

/** A field's words, its caret, and the other end of its selection (the caret's own place when none). */
export interface FieldState {
  readonly text: string;
  readonly caret: number;
  readonly anchor: number;
}

/** A second press this close in time (seconds) and place (pixels) to the first makes a double click. */
export const DOUBLE = { seconds: 0.5, reach: 4 } as const;

export const emptyField = (text = ''): FieldState => ({ text, caret: text.length, anchor: text.length });

const low = (state: FieldState) => Math.min(state.caret, state.anchor);
const high = (state: FieldState) => Math.max(state.caret, state.anchor);

/** `from` to `to` replaced by `text`, the caret then at `caret` (after the words put in, unless said), the field kept
 *  to `most` characters. */
export function replaced(
  state: FieldState,
  from: number,
  to: number,
  text: string,
  most = Infinity,
  caret?: number,
): FieldState {
  const room = Math.max(0, most - (state.text.length - (to - from)));
  // Cut at the most, but never between a pair's halves.
  const put = text.slice(0, room).replace(/[\ud800-\udbff]$/, '');
  const words = state.text.slice(0, from) + put + state.text.slice(to);
  const place = Math.min(words.length, caret ?? from + put.length);
  return { text: words, caret: place, anchor: place };
}

/** `text` typed over the selection. */
export const typed = (state: FieldState, text: string, most = Infinity): FieldState =>
  replaced(state, low(state), high(state), text, most);

/** The step a caret takes from `from` toward `step` (−1 back, 1 on): a character, kept whole across a surrogate pair,
 *  or a word with `word`. */
function stepFrom(text: string, from: number, step: -1 | 1, word: boolean): number {
  if (word) {
    let place = from;
    const spaceAt = (index: number) => /\s/.test(text[index] ?? '');
    if (step < 0) {
      while (place > 0 && spaceAt(place - 1)) place--;
      while (place > 0 && !spaceAt(place - 1)) place--;
    } else {
      while (place < text.length && spaceAt(place)) place++;
      while (place < text.length && !spaceAt(place)) place++;
    }
    return place;
  }
  const next = from + step;
  const code = text.charCodeAt(step < 0 ? next : from);
  const pair = step < 0 ? code >= 0xdc00 && code <= 0xdfff : code >= 0xd800 && code <= 0xdbff;
  return Math.max(0, Math.min(text.length, pair ? next + step : next));
}

/** Backspace (`step` −1) or Delete (1): the selection, or the character (word with `word`) beside the caret. */
export function erased(state: FieldState, step: -1 | 1, word = false): FieldState {
  if (state.caret !== state.anchor) return replaced(state, low(state), high(state), '');
  const other = stepFrom(state.text, state.caret, step, word);
  return replaced(state, Math.min(other, state.caret), Math.max(other, state.caret), '');
}

/** The caret moved a character (or word) back or on, to the start or end; the selection grown with `select`. */
export function moved(state: FieldState, to: -1 | 1 | 'start' | 'end', select: boolean, word = false): FieldState {
  let caret: number;
  if (to === 'start') caret = 0;
  else if (to === 'end') caret = state.text.length;
  else if (!select && state.caret !== state.anchor) caret = to < 0 ? low(state) : high(state);
  else caret = stepFrom(state.text, state.caret, to, word);
  return { ...state, caret, anchor: select ? state.anchor : caret };
}

/** All of it selected. */
export const allSelected = (state: FieldState): FieldState => ({ ...state, caret: state.text.length, anchor: 0 });

/** The place in `text` nearest `units` along it, by `widthTo` (how wide its words stand up to a place): never inside
 *  a surrogate pair. */
export function placeNear(text: string, units: number, widthTo: (place: number) => number): number {
  let [place, before] = [0, 0];
  for (const char of text) {
    const next = place + char.length;
    const width = widthTo(next);
    if (width >= units) return units - before < width - units ? place : next;
    [place, before] = [next, width];
  }
  return text.length;
}

/** The word round `place` selected, the caret at its end; the run of spaces there when it stands among them. */
export function wordAt(state: FieldState, place: number): FieldState {
  const { text } = state;
  const space = /\s/.test(text[place] ?? text[place - 1] ?? '');
  const alike = (index: number) => index >= 0 && index < text.length && /\s/.test(text[index] ?? '') === space;
  let [start, end] = [place, place];
  while (alike(start - 1)) start--;
  while (alike(end)) end++;
  return { text, caret: end, anchor: start };
}

/** What a key does to a field's words, caret and selection, as a page's field does it; null for a key that changes
 *  neither. Backspace and Delete are already done where the browser's own typing typed them (`typedAlready`). */
export function keyed(
  state: FieldState,
  key: string,
  shift: boolean,
  ctrl: boolean,
  typedAlready: boolean,
): FieldState | null {
  if (key === 'backspace' || key === 'delete')
    return typedAlready ? null : erased(state, key === 'backspace' ? -1 : 1, ctrl);
  if (key === 'arrowleft' || key === 'arrowright') return moved(state, key === 'arrowleft' ? -1 : 1, shift, ctrl);
  if (key === 'home' || key === 'end') return moved(state, key === 'home' ? 'start' : 'end', shift);
  return ctrl && key === 'a' ? allSelected(state) : null;
}

/** A field after the browser's typing replaced `from` to `to` with `text`, its caret and selection where the browser
 *  put them, within the words kept where the `most` cut short what it typed. */
export function edited(
  state: FieldState,
  edit: {
    readonly from: number;
    readonly to: number;
    readonly text: string;
    readonly caret: number;
    readonly anchor: number;
  },
  most: number,
): FieldState {
  const next = replaced(state, edit.from, edit.to, edit.text, most);
  const within = (place: number) => Math.max(0, Math.min(next.text.length, place));
  return { ...next, caret: within(edit.caret), anchor: within(edit.anchor) };
}
