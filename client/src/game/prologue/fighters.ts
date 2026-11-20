// Fights a cutscene stages: pairs of fighters of two factions trading blows, each blow a move the forge draws with
// the weapon in hand, the one struck guarding or blocking. Their moves run on a clock of their own so no two pairs
// strike together.
import { foeDress } from '../../player/foeDress.ts';
import type { Dress } from '../../player/dressing.ts';
import type { FoeType } from '../../rules/roster.ts';
import { type Actor, ACTOR_IDS } from './actors.ts';

/** A blow's move by what the right hand holds, played at 6 frames a second: a one-hand blade, a haft, a pair. */
function blowsOf(right: string | null, left: string | null): readonly string[] {
  if (left && /^dagger/.test(right ?? '')) return ['overpair', 'sidepair', 'thrustpair'];
  if (/^(warhammer|axe|mace|flail)/.test(right ?? '')) return ['overhaft', 'sidehaft'];
  return ['over1h', 'side1h', 'thrust1h'];
}

/** Seconds a blow takes (its nine frames at six a second) and the guard held between blows. */
const BLOW_S = 1.5;
const GUARD_S = 0.7;

/** One pair: who fights, by their roster types, where the pair stands (their middle, world metres) and the bearing
 *  from the first to the second. */
export interface Pairing {
  readonly first: number;
  readonly second: number;
  readonly at: readonly [number, number, number];
  readonly facing: number;
}

/** The move a fighter makes `clock` seconds into the fight, `phase` shifting them so a pair takes turns. */
export function fightMove(blows: readonly string[], clock: number, phase: number): string {
  const round = BLOW_S + GUARD_S;
  const into = (((clock + phase) % (round * 2)) + round * 2) % (round * 2);
  if (into < BLOW_S) return blows[Math.floor((clock + phase) / (round * 2)) % blows.length] ?? 'over1h';
  return into < round ? 'guard' : 'block';
}

/** Every fighter of the pairs as actors at `clock`: each pair a metre and three quarters apart, facing each other. */
export function fighters(
  roster: readonly FoeType[],
  pairs: readonly Pairing[],
  clock: number,
  firstId = ACTOR_IDS,
): Actor[] {
  const shown: Actor[] = [];
  pairs.forEach((pair, index) => {
    const [x, y, z] = pair.at;
    const [east, south] = [Math.sin(pair.facing) * 0.9, -Math.cos(pair.facing) * 0.9];
    const sides: [number, number, number, number][] = [
      [pair.first, x - east, y - south, pair.facing],
      [pair.second, x + east, y + south, pair.facing + Math.PI],
    ];
    sides.forEach(([type, standX, standY, facing], side) => {
      const kind = roster.find((each) => each.type === type);
      const dress: Dress | null = kind ? foeDress(kind) : null;
      if (!kind || !dress) return;
      const phase = index * 0.83 + side * (BLOW_S + GUARD_S);
      const anim = fightMove(blowsOf(kind.right, kind.left), clock, phase);
      // A blow plays from its first frame: the move began when this blow did.
      const round = BLOW_S + GUARD_S;
      const since = clock - ((((clock + phase) % round) + round) % round);
      shown.push({
        id: firstId + index * 2 + side,
        dress,
        anim,
        x: standX,
        y: standY,
        z,
        facing,
        since,
        hold: anim !== 'guard' && anim !== 'block',
      });
    });
  });
  return shown;
}
