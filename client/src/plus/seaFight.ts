// The sea fight's readout in the Plus kit, after DFO's helm readout (navalHud.js): what it shows and the words it says
// them in. The display draws it as it draws the on-foot HUD (`combat/seaReadout.ts`): the player's SHIP PLATE at the
// top left is the vitals' long thin bars (Hull over Sails over Crew; its BOOST RING, a fire and a brace chip under
// them; and the BATTERY ROSE of its sides' reloads); the TARGET CARD under the compass is the target's plate (the
// faction's emblem, its name, one hull bar in its rank's colour, its class, distance and state as small words); the
// TALLY of the last volley; and the WARNING under the card while a battery is run out at the player's ship.
import { BAR_TONES, VITAL_SIZES } from './barFrame.ts';

/** A side of the player's guns as the rose shows it: its share loaded, whether ready, just come ready, laid by the look, its
 *  load and the seconds it still loads. */
export interface RoseSide {
  readonly fill: number;
  readonly ready: boolean;
  readonly fresh: boolean;
  readonly laid: boolean;
  readonly load: string;
  readonly left: number;
}

/** The ship's burst of speed as its ring shows it: ready (lit whole), bursting (draining as the burst runs out) or
 *  charging (filling as it recharges), and the share of the ring lit. */
export interface BoostRing {
  readonly state: 'ready' | 'burst' | 'charging';
  readonly share: number;
}

/** What the readout shows: the player's ship, the ship the card is on, and its last volley's count; any of them none. */
export interface SeaFightModel {
  readonly ship: {
    readonly name: string;
    readonly hull: number;
    readonly sail: number;
    readonly crew: number;
    readonly fire: boolean;
    readonly braced: boolean;
    readonly boost: BoostRing;
    readonly port: RoseSide;
    readonly starboard: RoseSide;
    readonly blow: 'bow' | 'stern' | 'port' | 'starboard' | null;
  } | null;
  readonly card: {
    readonly name: string;
    readonly sub: string;
    readonly hull: number;
    readonly sail: number;
    readonly state: 'afloat' | 'struck' | 'sinking';
    readonly hostile: boolean;
    readonly boardKey: string | null;
    /** The captain's faction (1 the Grey Tithe, 2 pirates), whose emblem the card frames. */
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
  /** DFO's warning, under the card, while a captain's battery is run out at the player's ship, its words; none else. */
  readonly warn: string | null;
}

/** The gap between the card and a ship's plate under it, CSS pixels. */
export const CARD_GAP = 8;

/** What the boost ring says to a reader in each state. */
const BOOST_WORDS = { ready: 'Boost ready', burst: 'Boosting', charging: 'Boost recharging' } as const;

/** The readout's words, as DFO's `navalHudText` says them: a side's chip, the card's state and the tally's line; and
 *  the boost ring's, for a reader. */
export function seaFightWords(model: SeaFightModel) {
  const side = (rose: RoseSide) => (rose.ready ? rose.load : `${rose.load} ${Math.ceil(rose.left)}s`);
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
    port: model.ship ? side(model.ship.port) : '',
    starboard: model.ship ? side(model.ship.starboard) : '',
    boost: model.ship ? BOOST_WORDS[model.ship.boost.state] : '',
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
