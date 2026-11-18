import type { FighterView } from '../rules/fighters.ts';
import type { CardAt, Cards } from './cards.ts';
import { foeDoing } from './fightMoves.ts';
import { cardStand, type Placed, viewOf } from './figures.ts';
import { foeKind } from './foeKinds.ts';
import { Glides } from './glide.ts';
import { shownMove } from './playerMoves.ts';

/** A foe as a room's fight keeps it: its number, kind and level (0 for none), the room's glance at it now and at the
 *  snapshot before, and the room ticks between the two. */
export interface FoeSeen {
  readonly id: number;
  readonly kind: number;
  readonly level: number;
  readonly view: FighterView;
  readonly before: FighterView | null;
  readonly ticks: number;
}

/** The room's clock as a frame draws it: the page's seconds (which loop a move's frames), the room tick of the last
 *  snapshot, the frame's share of ticks, and a tick's seconds. */
export interface FoeClock {
  readonly clock: number;
  readonly roomTick: number;
  readonly frameTicks: number;
  readonly tickSeconds: number;
}

/** The moves a foe's figure is composed in ahead of time, so its first swing is drawn as it begins. */
const FOE_MOVES = ['idle', 'walk', 'run', 'thrust', 'chop', 'swing2h', 'parry', 'hurt', 'death', 'jump'];
/** Foes' figures are numbered down from here, clear of every player's, and never twice in the page's life: the forge
 *  keeps each figure's last card by its number. */
let nextFoeId = -1;

/**
 * Every foe's figure, in its kind's dress, gliding between the room's snapshots toward where the room last saw it and
 * showing the move its fight holds it to; made when a foe is first seen and let go once it is gone.
 */
export class FoeFigures {
  private readonly forge: Cards;
  private readonly figures = new Map<number, Placed>();
  private readonly glides = new Glides();

  constructor(forge: Cards) {
    this.forge = forge;
  }

  /** Each foe's figure as last drawn, by the room's number for it. */
  get placed(): ReadonlyMap<number, Placed> {
    return this.figures;
  }

  /** Every foe's card for an eye at `eye`, each flashing by `flashOf` its number. */
  cards(
    foes: Iterable<FoeSeen>,
    eye: { readonly x: number; readonly y: number },
    time: FoeClock,
    flashOf: (id: number) => number,
  ): CardAt[] {
    const { forge } = this;
    const cards: CardAt[] = [];
    const present = new Set<number>();
    for (const kept of foes) {
      present.add(kept.id);
      const kind = foeKind(kept.kind);
      if (!kind) continue;
      const { view } = kept;
      const placed = this.figures.get(kept.id) ?? {
        id: nextFoeId--,
        x: view.x,
        y: view.y,
        z: view.z,
        facing: 0,
        dress: kind.dress,
        anim: 'idle',
        frame: null,
        spin: false,
      };
      this.figures.set(kept.id, placed);
      const doing = foeDoing(view, kept.before, kind.dress, kept.ticks * time.tickSeconds);
      const move = shownMove(
        doing,
        (anim) => forge.frames(kind.dress.body, anim),
        (anim, held) => forge.draws(kind.dress.body, anim, held),
      );
      const moveFrames = forge.frames(kind.dress.body, move.anim);
      const frameShown = move.frame ?? Math.floor(time.clock / Math.max(move.frameSeconds, 0.01)) % moveFrames;
      const [x, y, z] = this.glides.follow(kept.id, [view.x, view.y, view.z], time.roomTick, time.frameTicks);
      Object.assign(placed, { x, y, z, facing: view.facing, anim: move.anim, frame: frameShown });
      forge.warm(kind.dress, FOE_MOVES);
      const { view: side, flip } = viewOf(placed.facing, x, y, eye.x, eye.y);
      const card = forge.card(placed.id, kind.dress, move.anim, side, frameShown, flip);
      const flash = { share: flashOf(kept.id), red: false };
      if (card) cards.push({ card, ...cardStand(x, y, eye.x, eye.y), z, flip, flash });
    }
    for (const id of this.figures.keys()) if (!present.has(id)) this.figures.delete(id);
    this.glides.keep(present);
    return cards;
  }

  /** Each foe as the fight's display marks it: named by its kind (and level), where its figure is drawn. */
  marked(foes: Iterable<FoeSeen>): { readonly id: number; readonly name: string; readonly view: FighterView }[] {
    return [...foes].map((kept) => {
      const figure = this.figures.get(kept.id);
      const view = figure ? { ...kept.view, x: figure.x, y: figure.y, z: figure.z } : kept.view;
      const name = foeKind(kept.kind)?.name ?? 'Foe';
      return { id: kept.id, name: kept.level > 0 ? `${name} ${kept.level}` : name, view };
    });
  }
}
