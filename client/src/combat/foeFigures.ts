import type { CardAt, Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { foeDoing, overProgress } from '../player/fightMoves.ts';
import { cardStand, type Placed, viewOf } from '../player/figures.ts';
import { foeDress } from '../player/foeDress.ts';
import { Glides } from '../player/glide.ts';
import { likelyMoves, Loop, shownMove } from '../player/playerMoves.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { Mode } from '../rules/movementRules.ts';
import { type FoeType, shownType } from '../rules/roster.ts';
import type { Fighting, KeptFoe } from './fighting.ts';
import type { Flashes } from './flashes.ts';
import type { MarkedFoe } from './foeBars.ts';

type Point = readonly [number, number, number];

/** How a page's attack feel draws a fighter (the Test Ground's): its view held back while a blow landing holds it, its
 *  figure shifted off where it stands, and each figure as drawn kept for its blow's arc. */
export interface FoeFeel {
  held(id: number, view: FighterView): FighterView;
  shift(id: number, view: FighterView): Point;
  readonly drawn: Map<number, { readonly feet: Point; readonly anim: string; readonly flip: boolean }>;
}

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
  private readonly loops = new Map<number, Loop>();
  /** Each foe going over a lip, as its glances showed it begin: the mode, the room tick and height it began at, and the
   *  most it has risen since. */
  private readonly overs = new Map<number, { mode: Mode; tick: number; z: number; highest: number }>();

  /** Each type's dress, from the rules' roster, is made once. */
  constructor(roster: readonly FoeType[]) {
    this.roster = roster;
    this.dresses = new Map(roster.map((type) => [type.type, foeDress(type)]));
  }

  /** Each foe's figure where it was last drawn, by the room's number. */
  get placed(): ReadonlyMap<number, Placed> {
    return this.figures;
  }

  /** The dress a foe's figure is drawn in, its type's; none for a type the roster does not know. */
  dressOf(kept: KeptFoe): Dress | null {
    return this.dresses.get(shownType(this.roster, kept)?.type ?? kept.type) ?? null;
  }

  /** Every foe's card as an eye at `eye` sees it: gliding toward where the room last saw it (`frameTicks` the frame's
   *  share of ticks, each `tickSeconds` long), showing the move its fight holds it to, its loops played on from where
   *  the page's `clock` first had them, flashing as `flashes` say, and drawn as a page's attack feel has it (`feel`),
   *  if one. */
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
      const over = this.overOf(kept, fight.roomTick, tickSeconds);
      const doing = { ...foeDoing(view, kept.before, dress, kept.ticks * tickSeconds), over };
      const draws = (anim: string, held: string | null) => forge.draws(dress.body, anim, held);
      const move = shownMove(doing, (anim) => forge.frames(dress.body, anim), draws);
      const moveFrames = forge.frames(dress.body, move.anim);
      const loop = this.loops.get(kept.id) ?? new Loop();
      this.loops.set(kept.id, loop);
      const frameShown = loop.frame(move, moveFrames, frameTicks * tickSeconds, clock);
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
      const drawnAt = [placed.x + moved[0], placed.y + moved[1], placed.z + moved[2]] as const;
      const { view: side, flip } = viewOf(placed.facing, drawnAt[0], drawnAt[1], eye.x, eye.y);
      feel?.drawn.set(kept.id, { feet: drawnAt, anim: move.anim, flip });
      const card = forge.card(placed.id, dress, move.anim, side, frameShown, flip);
      const flash = { share: flashes.shareOf(kept.id), red: false };
      if (card) cards.push({ card, ...cardStand(drawnAt[0], drawnAt[1], eye.x, eye.y), z: drawnAt[2], flip, flash });
    }
    for (const kept of [this.figures, this.loops, this.overs])
      for (const id of kept.keys()) if (!fight.foes.has(id)) kept.delete(id);
    this.glides.keep(new Set(fight.foes.keys()));
    return cards;
  }

  /** How far through a mantle or a vault a foe is, 0 to 1, by the room's tick (`tick`) since its glances first showed
   *  it going over, and how far it has risen; 0 in any other mode. A glance shows no progress, so it is reckoned by the
   *  rules' own law, a frame late at most where several snapshots came in one. */
  private overOf(kept: KeptFoe, tick: number, tickSeconds: number): number {
    const { mode, z } = kept.view;
    if (mode !== 'mantle' && mode !== 'vault') {
      this.overs.delete(kept.id);
      return 0;
    }
    const begun = this.overs.get(kept.id);
    const over = begun?.mode === mode ? begun : { mode, tick, z, highest: 0 };
    over.highest = Math.max(over.highest, z - over.z);
    this.overs.set(kept.id, over);
    return overProgress(mode, (tick - over.tick) * tickSeconds, z - over.z, over.highest);
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
