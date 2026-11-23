// The Storm taught in the fight after the wisp, each ability as the parry is: the fight frozen a moment with its
// prompt breathing until the player presses its key, once a cast would do something: Arc Lash once a foe stands in
// its cone and reach, Quicken and Tempest's release once foes are near. Each is ticked once cast, read from its charge
// spent.
import arts from '../../../../content/arts/arts.json' with { type: 'json' };
import type { AbilityState } from '../../combat/abilityBar.ts';
import { UNABLE } from '../../combat/casting.ts';
import type { BindId } from '../../player/binds.ts';
import type { FighterView } from '../../rules/fighters.ts';
import { askedKey } from '../controls.ts';
import type { Spell } from './tutorial.ts';

/** Each of the Storm's abilities: its key, its number among the Art's abilities (0 the Anima, 1 and 2 the Tenets) and
 *  its name. */
const ABILITIES: Readonly<Record<Spell, { readonly key: BindId; readonly ability: number; readonly name: string }>> = {
  tempest: { key: 'anima', ability: 0, name: 'Tempest' },
  quicken: { key: 'tenetOne', ability: 1, name: 'Quicken' },
  arcLash: { key: 'tenetTwo', ability: 2, name: 'Arc Lash' },
};
type Numbers = { readonly reach?: number; readonly coneDegrees?: number; readonly radius?: number } | undefined;
const storm = arts.arts.find((art) => art.key === 'storm');
const tenet = (key: string): Numbers => storm?.tenets.find((each) => each.key === key) as Numbers;
const arcLash = tenet('arcLash');
/** Arc Lash's reach (metres, with a body's half-width it reaches into) and the half of its cone (radians); and how
 *  near a foe stands for Quicken and Tempest to be taught: Quicken's own radius. */
const LASH_REACH_M = (arcLash?.reach ?? 7) + 0.35;
const LASH_HALF = (((arcLash?.coneDegrees ?? 70) / 2) * Math.PI) / 180;
const NEAR_M = tenet('quicken')?.radius ?? 12;

/** What the frozen fight asks of the player for `spell`, naming its key as bound now on the keys or the pad. */
export const castPrompt = (spell: Spell): string => {
  const { key, name } = ABILITIES[spell];
  return spell === 'tempest' ? `Press ${askedKey(key)} to release ${name}` : `Press ${askedKey(key)} to cast ${name}`;
};

/** The share of `spell`'s charge the bar shows, 1 when it is ready. */
const shareOf = (abilities: AbilityState, spell: Spell): number => {
  const { ability } = ABILITIES[spell];
  return ability === 0 ? abilities.animaShare : (abilities.tenets[ability - 1] ?? 0);
};

/** Whether `spell` would do something now, so the fight may freeze to teach it: the player able to cast, standing
 *  on their feet, its charge full; Arc Lash with a foe standing in its cone and reach, the others with one near. */
export function teachable(
  spell: Spell,
  own: FighterView | null,
  foes: readonly FighterView[],
  abilities: AbilityState | null,
): boolean {
  if (!own || !abilities || own.health <= 0 || own.mode !== 'ground' || UNABLE.has(own.action.kind)) return false;
  if (shareOf(abilities, spell) < 1) return false;
  return foes.some((foe) => {
    if (foe.side !== 'foes' || foe.health <= 0) return false;
    const apart = Math.hypot(foe.x - own.x, foe.y - own.y);
    if (spell !== 'arcLash') return apart <= NEAR_M;
    const toward = Math.atan2(foe.x - own.x, -(foe.y - own.y));
    const off = Math.abs(Math.atan2(Math.sin(toward - own.aim), Math.cos(toward - own.aim)));
    return apart <= LASH_REACH_M && off <= LASH_HALF;
  });
}

/** The spells cast between two frames' bars: each whose charge was full and is spent. */
export function castBetween(before: AbilityState | null, after: AbilityState | null): Spell[] {
  if (!before || !after) return [];
  const spells = Object.keys(ABILITIES) as Spell[];
  return spells.filter((spell) => shareOf(before, spell) >= 1 && shareOf(after, spell) < 1);
}

/** How long after a press answers a freeze it may not freeze again, seconds: the cast goes out (18 ticks) and its
 *  charge is seen spent. A press that cast nothing is asked again after it, until its step ticks. */
const ANSWERED_S = 1;

/** The fight frozen to teach the Storm's abilities: frozen while `spell` (the step not yet ticked) may be taught,
 *  until its key is pressed with the pointer the game's, when the press plays on into the fight. */
export class CastFreeze {
  /** The spell last answered and the seconds since: no freeze while its cast goes out (`ANSWERED_S`). */
  private answered: { spell: Spell; seconds: number } | null = null;

  frame(
    spell: Spell | null,
    teaches: boolean,
    answer: () => { readonly locked: boolean; readonly pressed: (key: BindId) => boolean },
    seconds: number,
  ): boolean {
    if (this.answered) this.answered.seconds += seconds;
    const waiting = this.answered?.spell === spell && (this.answered?.seconds ?? 0) < ANSWERED_S;
    if (!spell || !teaches || waiting) return false;
    const { locked, pressed } = answer();
    if (!locked || !pressed(ABILITIES[spell].key)) return true;
    this.answered = { spell, seconds: 0 };
    return false;
  }
}
