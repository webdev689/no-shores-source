import type { GlowLook } from '../elementGlow.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { FIGHT_TICKS, dodgeFacing, foeDoing, overProgress } from '../player/fightMoves.ts';
import { cardStand, type Placed, viewOf } from '../player/figures.ts';
import { foeDress } from '../player/foeDress.ts';
import { Glides } from '../player/glide.ts';
import { likelyMoves, Loop, shownMove } from '../player/playerMoves.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { Mode } from '../rules/movementRules.ts';
import { type FoeType, shownType } from '../rules/roster.ts';
import type { Fighting, KeptFoe } from './fighting.ts';
import { type Flashes, dissolveShare } from './flashes.ts';
import type { MarkedFoe } from './foeBars.ts';
import { ironOutline } from './glints.ts';
import {
  CHANGE_S,
  LATTICE_PLAIN,
  blinkShare,
  bulwarkChanged,
  latticeAnims,
  latticeBlinks,
  latticeHidden,
  latticeMove,
  latticeOfBody,
  withoutLayers,
} from './lattice.ts';
import { type LatticeShown, WAVE, latticeWaves, layLatticeLooks, waveFade } from './latticeLooks.ts';
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
/** How far back a foe's pace is read, in seconds. The rules hold a foe still a tick between steps as it keeps to a
 *  place that moves (its place on a ring, a target's heels), and a pace read tick by tick flicks it to a stand. */
const PACE_SECONDS = 0.1;

/** The chest of the fighter numbered `id` in `fight`, a player or another, as the Lattice's looks aim at it; null for
 *  none. */
function targetOf(fight: Fighting, id: number | null): Point | null {
  if (id === null) return null;
  const view = id === fight.player ? fight.own : fight.others.get(id)?.body;
  return view ? [view.x, view.y, view.z + CHEST_M] : null;
}
/** How high a fighter's chest is, as a shot aims at it (metres). */
const CHEST_M = 1.2;

/**
 * Every foe of a fight as a figure in its type's dress, by the room's number for each: drawn gliding between the
 * room's snapshots, showing the move its fight holds it to, and marked for the display where its figure stands.
 */
export class FoeFigures {
  private readonly roster: readonly FoeType[];
  private readonly dresses: ReadonlyMap<number, Dress | null>;
  /** The foes dressed in their own clothes, by the room's number. */
  private readonly dressed = new Map<number, Dress>();
  private readonly figures = new Map<number, Placed>();
  private readonly glides = new Glides();
  private readonly loops = new Map<number, Loop>();
  /** Each foe going over a lip, as its glances showed it begin: the mode, the room tick and height it began at, and the
   *  most it has risen since. */
  private readonly overs = new Map<number, { mode: Mode; tick: number; z: number; highest: number }>();
  /** Each foe's glances by room tick, back to the one its pace is read from. */
  private readonly trails = new Map<number, { tick: number; view: FighterView }[]>();
  /** Each dying foe's dissolve: its element, and when it begins (page seconds). */
  private readonly dissolves = new Map<number, { readonly look: GlowLook; readonly start: number }>();
  /** What stands over each foe drawn last: where its feet were drawn, and whether it is staggered or Exposed. */
  private readonly over = new Map<number, { feet: Point; staggered: boolean; exposed: boolean }>();
  /** Each Lattice foe drawn from its own pictures as last drawn, for what the game draws over them. */
  private readonly lattice = new Map<number, LatticeShown>();
  /** When each Bulwark began its change (page seconds). */
  private readonly changes = new Map<number, number>();
  /** When each Lattice foe died (page seconds): its wave burst then, and its figure fades from then. */
  private readonly dying = new Map<number, number>();

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

  /** The dress a foe's figure is drawn in: its own if it was dressed, else its type's; none for a type the roster
   *  does not know. */
  dressOf(kept: KeptFoe): Dress | null {
    return this.dressed.get(kept.id) ?? this.dresses.get(shownType(this.roster, kept)?.type ?? kept.type) ?? null;
  }

  /** Dresses the foe the room numbers `id`, of roster type `type`, in `look` with its type's weapons drawn, in place
   *  of its type's dress: as the Brig's crew wear their own clothes. Room numbers are never used twice, and a page
   *  dresses a few dozen at most, so a dress is kept past its foe. */
  dressFoe(id: number, type: number, look: Dress): void {
    const hands = this.roster.find((each) => each.type === type);
    this.dressed.set(id, {
      ...look,
      outfit: { ...look.outfit, right: hands?.right ?? null, left: hands?.left ?? null, drawn: true },
    });
  }

  /** Every foe's card as an eye at `eye` sees it: gliding toward where the room last saw it (`frameTicks` the frame's
   *  share of ticks, each `tickSeconds` long), showing the move its fight holds it to, its loops played on from where
   *  the page's `clock` first had them, flashing as `flashes` say, edged while Exposed, and drawn as a page's attack
   *  feel has it (`feel`), if one. */
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
      const typeDress = this.dressOf(kept);
      if (!typeDress) continue;
      // A Lattice foe is drawn from its own pictures once they are published, else as a plain figure its size.
      const kind = latticeOfBody(typeDress.body);
      const plain = !!kind && !forge.draws(typeDress.body, `${typeDress.body}_idle`, null);
      const own = plain ? null : kind;
      const dress = plain ? LATTICE_PLAIN : typeDress;
      let placed = this.figures.get(kept.id);
      if (!placed) {
        const { x, y } = kept.view;
        placed = { id: nextFoeId--, x, y, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
        this.figures.set(kept.id, placed);
      }
      // Its moves as its drawing shows them, held back while a blow landing holds it.
      const view = feel ? feel.held(kept.id, kept.view) : kept.view;
      const over = this.overOf(kept, fight.roomTick, tickSeconds);
      const now = foeDoing(view, kept.before, dress, kept.ticks * tickSeconds);
      // On the ground its pace is read over the last PACE_SECONDS, so a tick held still between steps is no stand.
      const paced = this.pacedFrom(kept, fight.roomTick, tickSeconds);
      const pace =
        paced && view.mode === 'ground'
          ? foeDoing(view, paced.view, dress, (fight.roomTick - paced.tick) * tickSeconds)
          : now;
      const doing = { ...now, moving: pace.moving, running: pace.running, speed: pace.speed, over };
      const draws = (anim: string, held: string | null) => forge.draws(dress.body, anim, held);
      const walking = (action: string) => forge.walking(dress, action);
      const frames = (anim: string) => forge.frames(dress.body, anim);
      const shown = shownMove(doing, frames, draws, walking);
      const changed = this.changed(kept, own?.body ?? '', clock);
      const move = (own && latticeMove(own.body, doing, shown, frames, changed.changed, changed.changing)) || shown;
      const moveFrames = forge.frames(dress.body, move.anim);
      const loop = this.loops.get(kept.id) ?? new Loop();
      this.loops.set(kept.id, loop);
      const frameShown = loop.frame(move, moveFrames, frameTicks * tickSeconds, clock);
      // Its own parts shown in the frames they belong to.
      const drawnDress = own
        ? withoutLayers(dress, latticeHidden(own.body, move.anim, frameShown, changed.changed))
        : dress;
      const [x, y, z] = this.glides.follow(
        kept.id,
        [kept.view.x, kept.view.y, kept.view.z],
        fight.roomTick,
        frameTicks,
      );
      const facing = dodgeFacing(view.action) ?? view.facing;
      Object.assign(placed, { x, y, z, facing, anim: move.anim, frame: frameShown });
      const [right, left] = dress.outfit.drawn ? [dress.outfit.right, dress.outfit.left] : [null, null];
      // Its likeliest moves, the telegraphed blows' strokes and what a fight holds it to.
      const likely = () => [
        ...likelyMoves(right, left, draws, dress.outfit.grip ?? null, walking),
        ...['thrust', 'chop', 'swing2h', 'parry', 'hurt', 'death'],
      ];
      forge.warm(dress, own ? () => latticeAnims(own.body) : likely, 0, placed.id);
      // A part taken away is a dress of its own: warmed under its own name, so the whole dress's queue stays.
      if (own && drawnDress !== dress) forge.warm(drawnDress, () => latticeAnims(own.body), 0, `${placed.id} part`);
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
      const action = kept.view.action;
      if (kind && action.kind === 'dead' && !this.dying.has(kept.id)) {
        // Its wave bursts as it falls; one long dead when first seen burst and faded already.
        const fresh = action.elapsed * tickSeconds < 1;
        this.dying.set(kept.id, fresh ? clock : clock - WAVE.fadeS);
        if (fresh) latticeWaves.burst(drawnAt, kind.strain, kind.scale, clock);
      }
      if (alive) this.dying.delete(kept.id);
      const dying = this.dying.get(kept.id);
      const blink =
        own && doing.fight?.kind === 'dodge' && latticeBlinks(own.body) ? blinkShare(doing.fight.progress) : 0;
      const dissolve =
        dying !== undefined
          ? { share: Math.max(waveFade(clock - dying), 1e-3), look: 0 as const }
          : blink > 0
            ? { share: blink, look: 3 as const }
            : this.dissolving(kept.id, alive, clock);
      const exposed = (kept.statuses?.expose ?? 0) > 0;
      const staggered = action.kind === 'staggered' && action.cause !== 'charged';
      this.over.set(kept.id, { feet: drawnAt, staggered, exposed: exposed && alive });
      if (own && alive)
        this.lattice.set(kept.id, {
          ...own,
          anim: move.anim,
          frame: frameShown,
          frames: moveFrames,
          feet: drawnAt,
          facing: placed.facing,
          target: targetOf(fight, kept.view.target),
        });
      else this.lattice.delete(kept.id);
      if (dissolve && dissolve.share >= 1) continue;
      const card = forge.card(placed.id, drawnDress, move.anim, side, frameShown, flip);
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
          ...(plain && kind && { scale: kind.scale }),
        });
    }
    const keptBy = [this.figures, this.loops, this.overs, this.trails, this.dissolves, this.over, this.lattice];
    for (const kept of [...keptBy, this.changes, this.dying])
      for (const id of kept.keys()) if (!fight.foes.has(id)) kept.delete(id);
    this.glides.keep(new Set(fight.foes.keys()));
    return cards;
  }

  /** The glance a foe's pace is read from at room tick `tick`, each `tickSeconds` long: the latest at least
   *  PACE_SECONDS before, else the oldest kept; null with none before this tick's. */
  private pacedFrom(kept: KeptFoe, tick: number, tickSeconds: number): { tick: number; view: FighterView } | null {
    const held = this.trails.get(kept.id) ?? [];
    // A room's clock gone back (the player joined it again) starts the trail over.
    const trail = (held.at(-1)?.tick ?? tick) <= tick ? held : [];
    if (trail.at(-1)?.tick !== tick) trail.push({ tick, view: kept.view });
    const from = tick - PACE_SECONDS / tickSeconds;
    while ((trail[1]?.tick ?? tick) <= from) trail.shift();
    this.trails.set(kept.id, trail);
    const first = trail[0];
    return first && first.tick < tick ? first : null;
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
    for (const shown of this.lattice.values()) layLatticeLooks(out, shown, eye);
    latticeWaves.lay(out, eye, clock);
    return out;
  }

  /** Whether a Bulwark (`body`) has changed, and how far through its change it is at `clock` (null once it is done, or
   *  for any other foe). */
  private changed(kept: KeptFoe, body: string, clock: number): { changed: boolean; changing: number | null } {
    if (body !== 'bulwark' || !bulwarkChanged(kept.phase, kept.view.health, kept.view.healthMax)) {
      // Healed back past half, it plays its change again when brought down to it.
      this.changes.delete(kept.id);
      return { changed: false, changing: null };
    }
    const began = this.changes.get(kept.id) ?? clock;
    this.changes.set(kept.id, began);
    const through = (clock - began) / CHANGE_S;
    return { changed: true, changing: through < 1 ? through : null };
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
