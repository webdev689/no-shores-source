// How the dialogue box moves on, as the player chooses in Settings: by default a typed line waits for a press (Click to
// continue), or under Auto it moves on by itself. A line said while a fight is on moves on by itself under either.
// The choice is kept in this browser, as the volumes are.

export type Pace = 'click' | 'auto';

/** The choices as Settings lists them, the default first. */
export const PACES: readonly { readonly value: Pace; readonly words: string }[] = [
  { value: 'click', words: 'Click to continue' },
  { value: 'auto', words: 'Auto' },
];

const PACE_KEY = 'noshores.dialogue';

/** Where the choice is kept: this browser's storage, which may be missing or refuse. */
type Kept = Pick<Storage, 'getItem' | 'setItem'>;
const browser = (): Kept | undefined => globalThis.localStorage as Kept | undefined;

/** The pace chosen while the storage refused to keep it, which holds until the page closes. */
let unkept: Pace | null = null;

/** The pace chosen, Click to continue where none is kept. */
export function dialoguePace(kept: Kept | undefined = browser()): Pace {
  try {
    return (unkept ?? kept?.getItem(PACE_KEY)) === 'auto' ? 'auto' : 'click';
  } catch {
    return 'click';
  }
}

export function setDialoguePace(pace: Pace, kept: Kept | undefined = browser()): void {
  try {
    kept?.setItem(PACE_KEY, pace);
    unkept = null;
  } catch {
    unkept = pace;
  }
}

/** Whether a line moves on by itself: said while a fight is on (`fight`), or under Auto. */
export const movesOnByItself = (fight: boolean, kept: Kept | undefined = browser()): boolean =>
  fight || dialoguePace(kept) === 'auto';
