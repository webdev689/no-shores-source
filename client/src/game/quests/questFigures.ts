// What a road's varied step stands in the world for the player alone: the figures it walks (an escort, on its horse,
// and a tail's quarry, on foot), each in its look, going or standing as the room says and facing as it sends, drawn
// between the room's last two words on it as other players are between snapshots; and the ward a defence keeps, as
// the figure its goal names or as a mark on the ground (footGear.ts), with a plate over it in the players' green giving
// its name and its health, held in view as a fought foe's.
import type { MarkedFoe } from '../../combat/foePlate.ts';
import { FIGURE_STATES, type QuestFigure, type QuestState } from '../../network/questMessages.ts';
import type { Cast } from '../../speech/cast.ts';
import type { FoeType } from '../../rules/roster.ts';
import { ACTOR_IDS, type Actor } from '../prologue/actors.ts';
import { goalOf } from './questBook.ts';
import { SPEAKERS, faceOf, speakerFace } from './questLooks.ts';

/** The figures' and the ward's numbers among the placed figures, clear of the story's own. */
const FIGURE_IDS = ACTOR_IDS + 300;
const WARD_ID = ACTOR_IDS + 299;
/** The ward's plate's number among the marked foes, which no room gives a fighter. */
export const WARD_PLATE_ID = -1;
/** How far over the ground a named ward's plate stands, metres, as over a figure's head. */
const WARD_RISE_M = 1;
/** The longest a figure takes from one of the room's words to the next, milliseconds: a word come later than this
 *  leaves it standing at the newer. */
const SPAN_MOST_MS = 500;
/** A figure further than this from where it was drawn as a word comes, metres, is set down there, not walked. */
const JUMP_M = 10;
/** The moves a step's figure is drawn in, on foot and on its horse, warmed in the forge before they are shown. */
export const FIGURE_MOVES: readonly string[] = ['walk', 'idle', 'horsegallop', 'horseidle'];
/** A ridden figure's frames a second, as the player's own horse's (playerMoves.ts): at a gallop, and standing. */
const GALLOP_FPS = 16;
const STANDING_FPS = 4;

/** Where a figure is drawn: its feet, and the way it faces (radians). */
type Place = readonly [number, number, number, number];

/** The way from one facing to another, the short way round (radians). */
const turnOf = (from: number, to: number): number => {
  const turn = (to - from) % (2 * Math.PI);
  return turn > Math.PI ? turn - 2 * Math.PI : turn < -Math.PI ? turn + 2 * Math.PI : turn;
};

/** The figures a step walks, each drawn from where it stood as the room's newest word came to where that word puts
 *  it, over as long as the words before it took: one word behind, as other players are drawn a snapshot behind. */
export class FigureGlides {
  private glides: { readonly from: Place; readonly to: Place; readonly at: number; readonly span: number }[] = [];
  private lastAt = Number.NEGATIVE_INFINITY;

  /** The room's new word on the figures, come at `now` (milliseconds). */
  heard(figures: readonly QuestFigure[], now: number): void {
    const span = Math.min(SPAN_MOST_MS, Math.max(1, now - this.lastAt));
    this.lastAt = now;
    this.glides = figures.map((figure, index) => {
      const to: Place = [figure.x, figure.y, figure.z, figure.facing];
      const was = this.glides[index];
      const from = was ? this.drawn(was, now) : to;
      const far = Math.hypot(to[0] - from[0], to[1] - from[1]) > JUMP_M;
      return { from: far ? to : from, to, at: now, span };
    });
  }

  /** Where the figure at `index` is drawn at `now`; none for one the room has not said. */
  place(index: number, now: number): Place | null {
    const glide = this.glides[index];
    return glide ? this.drawn(glide, now) : null;
  }

  private drawn(glide: FigureGlides['glides'][number], now: number): Place {
    const share = Math.min(1, Math.max(0, (now - glide.at) / glide.span));
    const [from, to] = [glide.from, glide.to];
    return [
      from[0] + (to[0] - from[0]) * share,
      from[1] + (to[1] - from[1]) * share,
      from[2] + (to[2] - from[2]) * share,
      share >= 1 ? to[3] : from[3] + turnOf(from[3], to[3]) * share,
    ];
  }
}

/** The figures a step walks, each in its look by `roster`'s types where and facing as `placed` draws it (as the room
 *  put it, unless said), walking while it walks (a quarry that noticed the player walks back), else standing where it
 *  is (one arrived stays); an escort's figure on its horse in its goal's coat, galloping while it goes; and the ward's
 *  figure where its goal names one, standing on `groundAt`'s ground. A figure whose look neither the cast nor the
 *  roster holds is not drawn, nor any from a word not on the player's own character. */
export function questActors(
  state: QuestState | null | undefined,
  roster: readonly FoeType[],
  groundAt: (x: number, y: number) => number | null,
  placed: (index: number, figure: QuestFigure) => Place = (_index, { x, y, z, facing }) => [x, y, z, facing],
): Actor[] {
  if (state?.claimed === false) return [];
  const walks: ReadonlySet<number> = new Set([FIGURE_STATES.walking, FIGURE_STATES.noticed]);
  const escort = goalOf(state, 'escort');
  const rider = escort?.horse && escort.who ? SPEAKERS.indexOf(escort.who) + 1 : null;
  const actors = (state?.figures ?? []).flatMap((figure, index): Actor[] => {
    const face = faceOf(figure.look, roster);
    if (!face) return [];
    const [x, y, z, facing] = placed(index, figure);
    const stood = { id: FIGURE_IDS + index, ...face, x, y, z, facing };
    const going = walks.has(figure.state);
    if (figure.look !== rider) return [{ ...stood, anim: going ? 'walk' : 'idle' }];
    const dress = { ...face.dress, outfit: { ...face.dress.outfit, coat: escort?.horse ?? null } };
    const anim = going ? 'horsegallop' : 'horseidle';
    return [{ ...stood, dress, anim, fps: going ? GALLOP_FPS : STANDING_FPS }];
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
  if (!ward || !goal || state?.claimed === false) return null;
  const name = goal.ward ?? (goal.who ? cast.speakers[goal.who]?.name : undefined) ?? 'The ward';
  const floor = groundAt(ward.x, ward.y) ?? 0;
  const healthMax = 100;
  const view = {
    ...{ x: ward.x, y: ward.y, z: goal.who ? floor : floor + WARD_RISE_M, facing: 0, mode: 'ground' as const },
    ...{ crouched: false, aim: 0, side: 'players' as const, arms: 0, stamina: 0, poise: 0, poiseMax: 0 },
    ...{ health: Math.round(Math.min(1, Math.max(0, ward.health)) * healthMax), healthMax, target: null },
    action: { kind: 'idle' as const },
  };
  return { id: WARD_PLATE_ID, name, view, rank: 1, faction: '', phase: 1, alert: 0, level: 0, ally: true, held: true };
}
