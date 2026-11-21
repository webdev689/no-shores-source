// What a road's varied step stands in the world for the player alone: the figures it walks (an escort, a tail's
// quarry), each in its look, walking or standing as the room says and facing as it sends; and the ward a defence
// keeps, as the figure its goal names or as a mark on the ground (footGear.ts), with a plate over it in the players'
// green giving its name and its health, as a companion's.
import type { MarkedFoe } from '../../combat/foePlate.ts';
import { FIGURE_STATES, type QuestState } from '../../network/questMessages.ts';
import type { Cast } from '../../speech/cast.ts';
import type { FoeType } from '../../rules/roster.ts';
import { ACTOR_IDS, type Actor } from '../prologue/actors.ts';
import { goalOf } from './questBook.ts';
import { faceOf, speakerFace } from './questLooks.ts';

/** The figures' and the ward's numbers among the placed figures, clear of the story's own and Maren's. */
const FIGURE_IDS = ACTOR_IDS + 300;
const WARD_ID = ACTOR_IDS + 299;
/** The ward's plate's number among the marked foes, which no room gives a fighter. */
export const WARD_PLATE_ID = -1;
/** How far over the ground a named ward's plate stands, metres, as over a figure's head. */
const WARD_RISE_M = 1;

/** The figures a step walks, each in its look by `roster`'s types, and the ward's figure where its goal names one,
 *  standing on `groundAt`'s ground. A figure whose look neither the cast nor the roster holds is not drawn. */
export function questActors(
  state: QuestState | null | undefined,
  roster: readonly FoeType[],
  groundAt: (x: number, y: number) => number | null,
): Actor[] {
  // shortcut: a figure stands where the room's last word put it, unglided; glide it as other players are (Glides)
  // if the room sends its figures less often than each tick.
  const actors = (state?.figures ?? []).flatMap((figure, index): Actor[] => {
    const face = faceOf(figure.look, roster);
    if (!face) return [];
    const anim = figure.state === FIGURE_STATES.walking ? 'walk' : 'idle';
    const { x, y, z, facing } = figure;
    return [{ id: FIGURE_IDS + index, ...face, anim, x, y, z, facing }];
  });
  const ward = state?.ward;
  const who = goalOf(state, 'defend')?.who;
  if (!ward || !who) return actors;
  const z = groundAt(ward.x, ward.y) ?? 0;
  return [...actors, { id: WARD_ID, ...speakerFace(who), anim: 'idle', x: ward.x, y: ward.y, z, facing: 0 }];
}

/** The ward's plate as the fight's display draws a companion's: its name (its goal's, or its figure's in `cast`) and
 *  its health's share, over it on `groundAt`'s ground; none without a ward here. */
export function wardPlate(
  state: QuestState | null | undefined,
  cast: Cast,
  groundAt: (x: number, y: number) => number | null,
): MarkedFoe | null {
  const ward = state?.ward;
  const goal = goalOf(state, 'defend');
  if (!ward || !goal) return null;
  const name = goal.ward ?? (goal.who ? cast.speakers[goal.who]?.name : undefined) ?? 'The ward';
  const floor = groundAt(ward.x, ward.y) ?? 0;
  const healthMax = 100;
  const view = {
    ...{ x: ward.x, y: ward.y, z: goal.who ? floor : floor + WARD_RISE_M, facing: 0, mode: 'ground' as const },
    ...{ crouched: false, aim: 0, side: 'players' as const, arms: 0, stamina: 0, poise: 0, poiseMax: 0 },
    ...{ health: Math.round(Math.min(1, Math.max(0, ward.health)) * healthMax), healthMax, target: null },
    action: { kind: 'idle' as const },
  };
  return { id: WARD_PLATE_ID, name, view, rank: 1, faction: '', phase: 1, alert: 0, level: 0, ally: true };
}
