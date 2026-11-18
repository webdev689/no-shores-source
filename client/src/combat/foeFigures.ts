import type { CardAt, Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { foeDoing } from '../player/fightMoves.ts';
import { cardStand, type Placed, viewOf } from '../player/figures.ts';
import { foeDress } from '../player/foeDress.ts';
import { Glides } from '../player/glide.ts';
import { likelyMoves, shownMove } from '../player/playerMoves.ts';
import type { FoeType } from '../rules/roster.ts';
import type { Fighting } from './fighting.ts';
import type { Flashes } from './flashes.ts';
import type { MarkedFoe } from './foeBars.ts';

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

  /** Each type's dress, from the rules' roster, is made once. */
  constructor(roster: readonly FoeType[]) {
    this.roster = roster;
    this.dresses = new Map(roster.map((type) => [type.type, foeDress(type)]));
  }

  /** Each foe's figure where it was last drawn, by the room's number. */
  get placed(): ReadonlyMap<number, Placed> {
    return this.figures;
  }

  /** Every foe's card as an eye at `eye` sees it: gliding toward where the room last saw it (`frameTicks` the frame's
   *  share of ticks, each `tickSeconds` long), showing the move its fight holds it to, flashing as `flashes` say. */
  cards(
    fight: Fighting,
    forge: Cards,
    eye: { readonly x: number; readonly y: number },
    clock: number,
    frameTicks: number,
    tickSeconds: number,
    flashes: Flashes,
  ): CardAt[] {
    const cards: CardAt[] = [];
    for (const kept of fight.foes.values()) {
      const dress = this.dresses.get(kept.type);
      if (!dress) continue;
      let placed = this.figures.get(kept.id);
      if (!placed) {
        const { x, y } = kept.view;
        placed = { id: nextFoeId--, x, y, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
        this.figures.set(kept.id, placed);
      }
      const { view } = kept;
      const doing = foeDoing(view, kept.before, dress, kept.ticks * tickSeconds);
      const draws = (anim: string, held: string | null) => forge.draws(dress.body, anim, held);
      const move = shownMove(doing, (anim) => forge.frames(dress.body, anim), draws);
      const moveFrames = forge.frames(dress.body, move.anim);
      const frameShown = move.frame ?? Math.floor(clock / Math.max(move.frameSeconds, 0.01)) % moveFrames;
      const [x, y, z] = this.glides.follow(kept.id, [view.x, view.y, view.z], fight.roomTick, frameTicks);
      Object.assign(placed, { x, y, z, facing: view.facing, anim: move.anim, frame: frameShown });
      const [right, left] = dress.outfit.drawn ? [dress.outfit.right, dress.outfit.left] : [null, null];
      // Its likeliest moves, the telegraphed blows' strokes and what a fight holds it to.
      forge.warm(dress, [...likelyMoves(right, left, draws), 'thrust', 'chop', 'swing2h', 'parry', 'hurt', 'death']);
      const { view: side, flip } = viewOf(placed.facing, placed.x, placed.y, eye.x, eye.y);
      const card = forge.card(placed.id, dress, move.anim, side, frameShown, flip);
      const flash = { share: flashes.shareOf(kept.id), red: false };
      if (card) cards.push({ card, ...cardStand(placed.x, placed.y, eye.x, eye.y), z: placed.z, flip, flash });
    }
    for (const id of this.figures.keys()) if (!fight.foes.has(id)) this.figures.delete(id);
    this.glides.keep(new Set(fight.foes.keys()));
    return cards;
  }

  /** Each foe as the display marks it: its type's name and faction from the roster, where its figure is drawn. */
  marked(fight: Fighting): MarkedFoe[] {
    return [...fight.foes.values()].map((kept) => {
      const figure = this.figures.get(kept.id);
      const view = figure ? { ...kept.view, x: figure.x, y: figure.y, z: figure.z } : kept.view;
      const type = this.roster.find((each) => each.type === kept.type);
      return { ...kept, name: type?.name ?? 'Foe', faction: type?.factionName ?? '', view };
    });
  }
}
