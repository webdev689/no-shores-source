import type { GlowLook } from '../elementGlow.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { foeDoing } from '../player/fightMoves.ts';
import { cardStand, type Placed, viewOf } from '../player/figures.ts';
import { foeDress } from '../player/foeDress.ts';
import { Glides } from '../player/glide.ts';
import { likelyMoves, shownMove } from '../player/playerMoves.ts';
import type { FighterView } from '../rules/fighters.ts';
import { type FoeType, shownType } from '../rules/roster.ts';
import type { Fighting, KeptFoe } from './fighting.ts';
import { FIGHT_TICKS } from '../player/fightMoves.ts';
import { type Flashes, dissolveShare } from './flashes.ts';
import type { MarkedFoe } from './foeBars.ts';
import { ironOutline } from './glints.ts';
import { overheadMarks } from './overheads.ts';

type Point = readonly [number, number, number];

/** How a page's attack feel draws a fighter (the Test Ground's): its view held back while a blow landing holds it, its
 *  figure shifted off where it stands, each figure as drawn kept for its blow's arc, and the smear its swing leaves. */
export interface FoeFeel {
  held(id: number, view: FighterView): FighterView;
  shift(id: number, view: FighterView): Point;
  readonly drawn: Map<number, { readonly feet: Point; readonly anim: string; readonly flip: boolean }>;
  smear?(id: number): CardAt['smear'];
}

/** A foe that dies dissolves once its fall is over (seconds after it died) when nothing gave its death an element. */
const PLAIN_DISSOLVE_AFTER_S = (FIGHT_TICKS.death + 6) / 60;

/** Foes' figures are numbered down from here, never twice in the page's life: the forge keeps each figure's last card
 *  by its number, so a number used again would first show another foe. */
let nextFoeId = -1;

/**
 * Every foe of a fight as a figure in its type's dress, by the room's number for each: drawn gliding between the
 * room's snapshots, showing the move its fight holds it to, and marked for the display where its figure stands.
 */
export class FoeFigures {
  private readonly roster: readonly FoeType[];
  private readonly dresses: ReadonlyMap<number, Dress | null>;
  private readonly figures = new Map<number, Placed>();
  private readonly glides = new Glides();
  /** Each dying foe's dissolve: its element, and when it begins (page seconds). */
  private readonly dissolves = new Map<number, { readonly look: GlowLook; readonly start: number }>();
  /** What stands over each foe drawn last: where its feet were drawn, and whether it is staggered or Exposed. */
  private readonly over = new Map<number, { feet: Point; staggered: boolean; exposed: boolean }>();

  /** Each type's dress, from the rules' roster, is made once. */
  constructor(roster: readonly FoeType[]) {
    this.roster = roster;
    this.dresses = new Map(roster.map((type) => [type.type, foeDress(type)]));
  }

  /** Each foe's figure where it was last drawn, by the room's number. */
  get placed(): ReadonlyMap<number, Placed> {
    return this.figures;
  }

  /** Dissolves the foe the room numbers `id` as it dies, in `look` (none for plain), from `start` seconds on the page's
   *  clock: Blaze burns it away from the feet, Volt blinks it out, Cosmic draws it in. Once dissolved it is not drawn;
   *  standing again, it is whole. */
  dissolveFoe(id: number, look: GlowLook, start: number): void {
    this.dissolves.set(id, { look, start });
  }

  /** The dress a foe's figure is drawn in, its type's; none for a type the roster does not know. */
  dressOf(kept: KeptFoe): Dress | null {
    return this.dresses.get(shownType(this.roster, kept)?.type ?? kept.type) ?? null;
  }

  /** Every foe's card as an eye at `eye` sees it: gliding toward where the room last saw it (`frameTicks` the frame's
   *  share of ticks, each `tickSeconds` long), showing the move its fight holds it to, flashing as `flashes` say, edged
   *  while Exposed, and drawn as a page's attack feel has it (`feel`), if one. */
  cards(
    fight: Fighting,
    forge: Cards,
    eye: { readonly x: number; readonly y: number },
    clock: number,
    frameTicks: number,
    tickSeconds: number,
    flashes: Flashes,
    feel: FoeFeel | null = null,
  ): CardAt[] {
    const cards: CardAt[] = [];
    for (const kept of fight.foes.values()) {
      const dress = this.dressOf(kept);
      if (!dress) continue;
      let placed = this.figures.get(kept.id);
      if (!placed) {
        const { x, y } = kept.view;
        placed = { id: nextFoeId--, x, y, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
        this.figures.set(kept.id, placed);
      }
      // Its moves as its drawing shows them, held back while a blow landing holds it.
      const view = feel ? feel.held(kept.id, kept.view) : kept.view;
      const doing = foeDoing(view, kept.before, dress, kept.ticks * tickSeconds);
      const draws = (anim: string, held: string | null) => forge.draws(dress.body, anim, held);
      const walking = (action: string) => forge.walking(dress, action);
      const move = shownMove(doing, (anim) => forge.frames(dress.body, anim), draws, walking);
      const moveFrames = forge.frames(dress.body, move.anim);
      const frameShown = move.frame ?? Math.floor(clock / Math.max(move.frameSeconds, 0.01)) % moveFrames;
      const [x, y, z] = this.glides.follow(
        kept.id,
        [kept.view.x, kept.view.y, kept.view.z],
        fight.roomTick,
        frameTicks,
      );
      Object.assign(placed, { x, y, z, facing: view.facing, anim: move.anim, frame: frameShown });
      const [right, left] = dress.outfit.drawn ? [dress.outfit.right, dress.outfit.left] : [null, null];
      // Its likeliest moves, the telegraphed blows' strokes and what a fight holds it to.
      forge.warm(dress, [...likelyMoves(right, left, draws), 'thrust', 'chop', 'swing2h', 'parry', 'hurt', 'death']);
      const moved = feel ? feel.shift(kept.id, kept.view) : ([0, 0, 0] as const);
      const alive = kept.view.action.kind !== 'dead';
      const knocked = flashes.knockOf(kept.id, alive);
      const drawnAt = [
        placed.x + moved[0] + knocked[0],
        placed.y + moved[1] + knocked[1],
        placed.z + moved[2],
      ] as const;
      const { view: side, flip } = viewOf(placed.facing, drawnAt[0], drawnAt[1], eye.x, eye.y);
      feel?.drawn.set(kept.id, { feet: drawnAt, anim: move.anim, flip });
      const dissolve = this.dissolving(kept.id, alive, clock);
      const exposed = (kept.statuses?.expose ?? 0) > 0;
      const action = kept.view.action;
      const staggered = action.kind === 'staggered' && action.cause !== 'charged';
      this.over.set(kept.id, { feet: drawnAt, staggered, exposed: exposed && alive });
      if (dissolve && dissolve.share >= 1) continue;
      const card = forge.card(placed.id, dress, move.anim, side, frameShown, flip);
      const stand = cardStand(drawnAt[0], drawnAt[1], eye.x, eye.y);
      if (card)
        cards.push({
          card,
          ...stand,
          z: drawnAt[2],
          flip,
          flash: flashes.flashOf(kept.id) ?? ironOutline(action),
          exposed,
          charged: (kept.statuses?.charge ?? 0) > 0,
          jitter: flashes.shakeOf(kept.id),
          dissolve,
          smear: feel?.smear?.(kept.id) ?? null,
        });
    }
    for (const id of this.figures.keys()) if (!fight.foes.has(id)) this.figures.delete(id);
    for (const id of [...this.dissolves.keys(), ...this.over.keys()]) {
      if (fight.foes.has(id)) continue;
      this.dissolves.delete(id);
      this.over.delete(id);
    }
    this.glides.keep(new Set(fight.foes.keys()));
    return cards;
  }

  /** How far a foe has dissolved at `clock`, or nothing while it lives or before its dissolve begins; a death no one
   *  gave an element dissolves plain once its fall is over. */
  private dissolving(id: number, alive: boolean, clock: number): CardAt['dissolve'] {
    if (alive) {
      // One standing again is whole; a dissolve asked just as it falls waits for its death.
      const asked = this.dissolves.get(id);
      if (asked && clock > asked.start + 1) this.dissolves.delete(id);
      return undefined;
    }
    let dissolve = this.dissolves.get(id);
    if (!dissolve) {
      dissolve = { look: 0, start: clock + PLAIN_DISSOLVE_AFTER_S };
      this.dissolves.set(id, dissolve);
    }
    const share = dissolveShare(dissolve.look, clock - dissolve.start);
    return clock < dissolve.start ? undefined : { share: Math.max(share, 1e-3), look: dissolve.look };
  }

  /** The marks over the foes as last drawn, seen from `eye` at `clock`: a staggered one's circling stars and an
   *  Exposed one's cracked diamond. */
  overheads(eye: Point, clock: number): number[] {
    const out: number[] = [];
    for (const shown of this.over.values()) overheadMarks(out, shown.feet, eye, clock, shown);
    return out;
  }

  /** Each foe as the display marks it: its type's name and faction from the roster, where its figure is drawn. */
  marked(fight: Fighting): MarkedFoe[] {
    return [...fight.foes.values()].map((kept) => {
      const figure = this.figures.get(kept.id);
      const view = figure ? { ...kept.view, x: figure.x, y: figure.y, z: figure.z } : kept.view;
      const type = shownType(this.roster, kept);
      return {
        ...kept,
        name: type?.name ?? 'Foe',
        faction: type?.factionName ?? '',
        factionNumber: kept.faction || (type?.faction ?? 0),
        view,
      };
    });
  }
}
