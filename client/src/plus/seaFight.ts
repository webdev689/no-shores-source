// The sea fight's readout in the Plus kit, after DFO's helm readout (navalHud.js): what it shows and the words it says
// them in. The display draws it as it draws the on-foot HUD (`combat/seaReadout.ts`): the player's SHIP PLATE at the
// top left is the vitals' long thin bars (Hull over Sails over Crew, a fire chip under them); the SHIP'S BAR at the
// bottom left holds its abilities as the Arts' bar holds theirs (each broadside's reload, the burst, the brace and the
// load); the TARGET CARD under the compass is the target's plate (the faction's emblem, its name, one hull bar in its
// rank's colour, its class, distance and state as small words); the TALLY of the last volley; and the WARNING under
// the card while a battery is run out at the player's ship.
import { BAR_TONES, VITAL_SIZES } from './barFrame.ts';

/** The loads a ship's guns take. */
export type SeaShot = 'round' | 'grape' | 'chain' | 'heated';
/** The pictures the ship's bar draws its abilities with: a side's gun, the burst, the brace and each load. */
export type ShipIcon = 'port' | 'starboard' | 'burst' | 'brace' | SeaShot;

/** One of the ship's abilities as its bar shows it, so another is one more of them: which it is and its picture, its
 *  name and the key that uses it as a keycap draws it (`pad:` before a pad's button); whether it is ready, recharging
 *  or in use, and whether it cannot be used now; how far it has recharged (1 ready) and the seconds still to go; the
 *  share of a use still to run; whether its side is laid by the look; and how it stands, in words, for a reader. */
export interface ShipAbility {
  readonly id: string;
  readonly icon: ShipIcon;
  readonly name: string;
  readonly key: string;
  readonly state: 'ready' | 'charging' | 'active';
  readonly unable: boolean;
  readonly charge: number;
  readonly left: number;
  readonly running: number;
  readonly laid: boolean;
  readonly said: string;
}

/** What the readout shows: the player's ship, the ship the card is on, and its last volley's count; any of them none. */
export interface SeaFightModel {
  readonly ship: {
    readonly name: string;
    readonly hull: number;
    readonly sail: number;
    readonly crew: number;
    readonly fire: boolean;
    readonly abilities: readonly ShipAbility[];
  } | null;
  readonly card: {
    readonly name: string;
    readonly sub: string;
    readonly hull: number;
    readonly sail: number;
    readonly state: 'afloat' | 'struck' | 'sinking';
    readonly hostile: boolean;
    readonly boardKey: string | null;
    /** The captain's faction (1 the Grey Tithe), whose emblem the card frames. */
    readonly faction: number;
    /** The colour its bar is in, as a foe's plate's: its rank's band, or an ally's. */
    readonly band: string;
  } | null;
  readonly tally: {
    readonly balls: number;
    readonly hits: number;
    readonly holed: number;
    readonly rig: number;
  } | null;
  /** The warning under the card while a captain's battery is run out at the player's ship; none else. */
  readonly warn: SeaWarning | null;
}

/** A battery run out at the player's ship: which (`id`, its captain's number and side, so another's tell starts
 *  afresh), whose, how far off and where from the player's bow, the shot it is loaded with, its tell, the brace's key
 *  and whether the player stands braced. */
export interface SeaWarning {
  readonly id: string;
  readonly name: string;
  readonly range: number;
  readonly bearing: string;
  readonly load: SeaShot;
  /** Seconds a battery stands run out before it may fire, and how long this one has. */
  readonly tell: number;
  readonly ranFor: number;
  readonly braceKey: string;
  readonly braced: boolean;
}

/** What each load does to the player's ship, as its rules hurt (crates/naval/src/damage.rs). */
const SHOT_HARM: Readonly<Record<SeaShot, string>> = {
  round: 'Round shot - holes your hull',
  chain: 'Chain shot - tears your sails',
  grape: 'Grape shot - cuts down your crew',
  heated: 'Heated shot - can set you alight',
};

/** The warning's words: its title, the brace as it stands, and for a screen reader one line of whose battery, where
 *  from the bow, and its shot and what it does. */
export function seaWarnWords(warn: SeaWarning) {
  const who = `${warn.name} - ${Math.round(warn.range)} m ${warn.bearing}`;
  const said = `Broadside from the ${who}. ${SHOT_HARM[warn.load]}. ${warn.braced ? 'Braced' : `${warn.braceKey.replace(/^pad:/, '')}: brace`}.`;
  return { title: 'Broadside', brace: warn.braced ? 'Braced' : 'Brace', said };
}

/** The gap between the card and a ship's plate under it, CSS pixels. */
export const CARD_GAP = 8;

/** The readout's words, as DFO's `navalHudText` says them: the card's state and the tally's line. */
export function seaFightWords(model: SeaFightModel) {
  const card = model.card;
  const state = !card
    ? ''
    : card.state === 'sinking'
      ? 'Going down'
      : card.state === 'struck'
        ? card.boardKey
          ? `Colors struck - ${card.boardKey}: board`
          : 'Colors struck'
        : card.hostile
          ? 'Hostile'
          : '';
  const tally = model.tally;
  return {
    state,
    tally: tally
      ? `${tally.hits} of ${tally.balls} ${tally.balls === 1 ? 'ball' : 'balls'} struck` +
        (tally.holed ? ` - ${tally.holed} below the waterline` : '') +
        (tally.rig ? ` - ${tally.rig} in the rigging` : '')
      : '',
  };
}

/** The ship's bars as the vitals' thin bars: the hull at health's height, its frame warning in blood; the sails and
 *  the crew at stamina's. */
export const SHIP_BARS = {
  hull: { base: VITAL_SIZES.base.health, wide: VITAL_SIZES.wide.health, alert: BAR_TONES.blood },
  sail: { base: VITAL_SIZES.base.stamina, wide: VITAL_SIZES.wide.stamina, alert: BAR_TONES.blood },
  crew: { base: VITAL_SIZES.base.stamina, wide: VITAL_SIZES.wide.stamina, alert: BAR_TONES.blood },
} as const;
