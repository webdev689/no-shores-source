// What Settings' Graphics tab chooses, each kept in this browser: the resolution (`renderScale.ts`), how much of the
// meadow's grass is drawn (all of it, half its tufts, or none) and whether the sun casts shadows. The grass and the
// shadows each spare the GPU a pass's work the frame they change.

/** A setting's choices as Settings offers them, by the value each is kept as. */
export type Choices = readonly { readonly value: string; readonly words: string }[];

/** A setting kept in this browser under `key`: the first of `choices` unless another is kept, read once and then
 *  held, so a browser that keeps nothing still draws what it shows. */
export function keptChoice(key: string, choices: Choices) {
  let chosen: string | null = null;
  return {
    choices,
    get(): string {
      if (chosen !== null) return chosen;
      let kept: string | null = null;
      try {
        kept = localStorage.getItem(key);
      } catch {
        // A browser that keeps nothing draws the first choice.
      }
      chosen = choices.find((choice) => choice.value === kept)?.value ?? choices[0]?.value ?? '';
      return chosen;
    },
    set(value: string): void {
      chosen = value;
      try {
        localStorage.setItem(key, value);
      } catch {
        // A browser that keeps nothing still hears the change until the page closes.
      }
    },
  };
}

export const GRASS = keptChoice('noshores.grass', [
  { value: 'full', words: 'Full' },
  { value: 'half', words: 'Half' },
  { value: 'off', words: 'Off' },
]);
export const SHADOWS = keptChoice('noshores.shadows', [
  { value: 'on', words: 'On' },
  { value: 'off', words: 'Off' },
]);

/** The share of the meadow's tufts each choice draws. */
const GRASS_SHARES: Readonly<Record<string, number>> = { full: 1, half: 0.5, off: 0 };

/** The share of the meadow's tufts drawn. */
export const grassShare = (): number => GRASS_SHARES[GRASS.get()] ?? 1;

/** Whether the sun casts shadows. */
export const shadowsOn = (): boolean => SHADOWS.get() === 'on';
