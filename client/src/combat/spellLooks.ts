// Every spell in the room drawn as the marks are, in its Art's element: Storm's in Volt, Divine's in Blaze, Shadow's
// in Cosmic. Each is glided between the room's snapshots as the figures are, drawn through its start, its life and
// its end (`spellDrawers.ts`), leaves what it lands with (`spellLands.ts`), and an Anima has its moment
// (`animaMoment.ts`). The statuses that show on the world are drawn here too: streaks behind the Hasted, motes off the
// Linked, and Volt crackling on a Charged foe. All of it is laid at the figures as drawn, the ground first, then what
// stands far to near.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import { Glides } from '../player/glide.ts';
import { statusesOf } from '../rules/fighters.ts';
import { AnimaMoments, type AnimaScreen, QUIET, animaOf } from './animaMoment.ts';
import { chainMarks, chainVerdict } from './chainLooks.ts';
import { EVENT, HOW } from './cues.ts';
import type { Fighting } from './fighting.ts';
import type { Sparks } from './sparks.ts';
import { DRAWERS, type Kept, TRAILED, TRAIL_S, ended, landed } from './spellDrawers.ts';
import type { KeptSpell } from './spellEffects.ts';
import { Lands } from './spellLands.ts';
import { Tails, risingMotes, trailLine } from './spellLines.ts';
import {
  BLAZE,
  CHEST_M,
  type Frame,
  type Point,
  type SeenFoe,
  type SeenPlayer,
  TICK_S,
  VOLT,
  apartFrom,
  onBody,
} from './spellPlaces.ts';
import { GLINTS, Laid, STAR, billboard } from './spellPixels.ts';

/** A Hasted player's streaks: how long each lasts (seconds), each line's way aside of their path and height (metres),
 *  how far they must have moved in the streaks' time to leave any, and how wide they are drawn (three of a figure's
 *  pixels at their newest). */
const STREAK_S = 0.3;
const STREAK_LINES = [
  [-0.22, 0.55],
  [0.22, 1.05],
  [0, 1.5],
] as const;
const STREAK_MOVING_M = 0.4;
const STREAK_SCALE = 0.8;
/** The sparks a Charged foe throws a second. */
const CRACKLE_SPARKS = 24;
/** Past this long with no new snapshot (seconds), the room's word has stopped (the link lost, or sent away): its
 *  spells are drawn no longer. */
const STALE_S = 0.25;
/** An Anima first seen this young (ticks) was cast just now: its moment plays. Older, a player came upon it. */
const RELEASE_FRESH_TICKS = 12;

/** Where the page draws each figure: the foes' and the other players', by the room's number. */
export interface Drawn {
  readonly foes: ReadonlyMap<number, { readonly x: number; readonly y: number; readonly z: number }>;
  readonly others: ReadonlyMap<number, { readonly x: number; readonly y: number; readonly z: number }>;
}

/** The element an Art glows in, by its number; none for one unknown. */
export function elementOfArt(art: number | undefined): GlowLook {
  const element = arts.arts.find((one) => one.id === art)?.element;
  return element === 1 || element === 2 || element === 3 ? element : 0;
}

/** Every player in the fight: the player's own fighter as the page predicts it, the others where `drawn` has their
 *  figures (as the room sent them, with none). */
function playersOf(fight: Fighting, drawn: Drawn | null): SeenPlayer[] {
  const own = fight.own;
  const seen: SeenPlayer[] = own
    ? [{ id: fight.player, feet: [own.x, own.y, own.z], aim: own.aim, statuses: own.statuses }]
    : [];
  for (const [id, other] of fight.others) {
    const { x, y, z } = drawn?.others.get(id) ?? other.body;
    const statuses = other.fighter ? statusesOf(other.fighter) : undefined;
    seen.push({ id, feet: [x, y, z], aim: other.body.facing, statuses });
  }
  return seen;
}

/** Every foe in the fight but those still arriving, which no spell meets until they land, where `drawn` has its
 *  figure (as the room sent it, with none). */
function foesOf(fight: Fighting, drawn: Drawn | null): SeenFoe[] {
  return [...fight.foes.values()].flatMap((kept) => {
    if (kept.arrival) return [];
    const { x, y, z } = drawn?.foes.get(kept.id) ?? kept.view;
    return [{ id: kept.id, feet: [x, y, z] }];
  });
}

/** Whether player `id` is Veiled as the fight last had them: their figure is drawn faint and shimmering. */
export function veiledIn(fight: Fighting, id: number): boolean {
  const fighter = fight.others.get(id)?.fighter;
  const statuses = id === fight.player ? fight.own?.statuses : fighter ? statusesOf(fighter) : undefined;
  return (statuses?.veiled ?? 0) > 0;
}

/** The element player `id`'s cast glows in: the Art of the last spell of theirs the room sent; none before one. */
export const castLookOf = (fight: Fighting, id: number): GlowLook => elementOfArt(fight.spells.arts.get(id));

/** A Hasted player's streaks, from where they have been lately (newest first): none while they stand or barely
 *  move. */
function streaks(frame: Frame, tail: readonly { readonly at: Point; readonly age: number }[]): void {
  const [newest, oldest] = [tail[0], tail.at(-1)];
  if (!newest || !oldest) return;
  const [wayX, wayY] = [newest.at[0] - oldest.at[0], newest.at[1] - oldest.at[1]];
  const moved = Math.hypot(wayX, wayY);
  if (moved < STREAK_MOVING_M) return;
  const [sideX, sideY] = [-wayY / moved, wayX / moved];
  for (const [aside, up] of STREAK_LINES) {
    const line = tail.map(({ at: place, age }) => ({
      at: [place[0] + sideX * aside, place[1] + sideY * aside, place[2] + up] as const,
      age,
    }));
    trailLine(frame.out, frame.eye, line, VOLT, STREAK_S, STREAK_SCALE);
  }
}

/** A Charged foe crackling where its feet stand: Volt's sparks thrown off it. Its arcs are its card's own, inside
 *  its figure (player/cardLooks.ts). */
function crackle(frame: Frame, feet: Point): void {
  const thrown = Math.floor(CRACKLE_SPARKS * frame.seconds + frame.random());
  for (let spark = 0; spark < thrown; spark++)
    frame.sparks.burst(onBody(feet, frame.eye, frame.random(), frame.random()), [0, 0], 1, VOLT, 0.5);
}

/** Something to draw this frame, and how far from the eye it stands: what stands is laid far to near. */
interface Job {
  readonly far: number;
  readonly run: () => void;
}

/** A spell drawn: as the room last sent it, where it was last drawn, and what its drawer keeps of it. */
interface Shown {
  spell: KeptSpell;
  place: Point;
  readonly kept: Kept;
}

/**
 * Draws every spell in a fight, frame by frame, as mark vertices: each one glided between the room's snapshots as
 * the figures are, through its start, its life and its end, with what it leaves as it lands. The fight's sparks carry
 * the embers, motes and sparks it throws.
 */
export class SpellLooks {
  private readonly sparks: Sparks;
  private readonly random: () => number;
  private readonly shown = new Map<number, Shown>();
  private readonly glides = new Glides();
  private readonly trails = new Tails();
  private readonly streaks = new Tails();
  private readonly lands = new Lands();
  private readonly anima = new AnimaMoments();
  private readonly hits: FightEvent[] = [];
  private readonly chains: FightEvent[] = [];
  /** The room tick of the last snapshot drawn from, and the seconds since it came. */
  private tick = Number.NaN;
  private since = 0;
  /** The vertices laid each frame: on the ground, and standing, laid after them in the answer. */
  private readonly ground = new Laid();
  private readonly standing = new Laid();

  constructor(sparks: Sparks, random: () => number = Math.random) {
    this.sparks = sparks;
    this.random = random;
  }

  /** The player's own screen as their Anima's release takes it: its edge frame and the view's push in. */
  get screen(): AnimaScreen {
    return this.since > STALE_S ? QUIET : this.anima.screen;
  }

  /** Takes a frame's fight events: each spell that lands on a foe marks where it lands, and each Atheric's leap or
   *  burst where it went, the next frame drawn. */
  struck(events: readonly FightEvent[]): void {
    for (const event of events) {
      if (event.how === HOW.spell && event.kind === EVENT.hit && this.hits.length < 64) this.hits.push(event);
      if (chainVerdict(event) && this.chains.length < 64) this.chains.push(event);
    }
  }

  /** The marks of every spell in `fight`, and of the statuses that show, seen from `eye`: `seconds` the frame's (none
   *  while the fight waits) and `clock` the page's, each figure where `drawn` has it. The answer is the looks' own and
   *  holds until the next call. */
  marks(fight: Fighting, eye: Point, seconds: number, clock: number, drawn: Drawn | null = null): number[] {
    if (fight.roomTick !== this.tick) [this.tick, this.since] = [fight.roomTick, 0];
    else this.since += seconds;
    const { ground, standing } = this;
    ground.clear();
    standing.clear();
    if (this.since > STALE_S) {
      this.lands.clear();
      this.hits.length = 0;
      this.chains.length = 0;
      return ground.laid();
    }
    const [players, foes] = [playersOf(fight, drawn), foesOf(fight, drawn)];
    const frame: Frame = {
      ground,
      out: standing,
      eye,
      seconds,
      clock,
      sparks: this.sparks,
      random: this.random,
      players,
      foes,
      own: fight.player,
    };
    const jobs: Job[] = [];
    this.spells(fight, frame, jobs);
    this.statuses(fight, frame, jobs);
    const own = players.find((player) => player.id === fight.player);
    this.anima.frame(frame, fight.castSent, own?.feet ?? null);
    this.lands.jobs(frame, jobs);
    jobs.sort((first, second) => second.far - first.far);
    for (const job of jobs) job.run();
    ground.append(standing);
    return ground.laid();
  }

  /** Every spell's job this frame, each glided to its place; an Anima's moment as it is first seen, the mark each
   *  leaves the frame after it goes, and the marks of the spells that landed. */
  private spells(fight: Fighting, frame: Frame, jobs: Job[]): void {
    const { lands } = this;
    const present = new Set<number>();
    const frameTicks = frame.seconds / TICK_S;
    for (const spell of fight.spells.spells.values()) {
      present.add(spell.id);
      const place = this.glides.follow(spell.id, spell.at, fight.roomTick, frameTicks);
      const caster = frame.players.find((player) => player.id === spell.caster);
      let shown = this.shown.get(spell.id);
      const first = !shown;
      if (!shown) {
        shown = {
          spell,
          place,
          kept: { aim: caster?.aim ?? 0, heading: caster?.aim ?? 0, mark: null, markAt: 0, marked: 0 },
        };
        this.shown.set(spell.id, shown);
        if (animaOf(spell.kind) && spell.age <= RELEASE_FRESH_TICKS) {
          const feet = caster?.feet ?? ([spell.at[0], spell.at[1], spell.at[2] - CHEST_M] as const);
          this.anima.release(frame, lands, spell.kind, spell.caster, feet, caster?.aim ?? 0);
        }
      }
      [shown.spell, shown.place] = [spell, place];
      const trail = TRAILED.has(spell.kind) ? this.trails.add(spell.id, place, frame.clock, TRAIL_S) : [];
      const where = { at: place, first, trail, kept: shown.kept };
      const draw = DRAWERS[spell.kind];
      if (draw) jobs.push({ far: apartFrom(frame.eye, place), run: () => draw(frame, spell, where, lands) });
    }
    const kinds = new Map<number, Set<number>>();
    const cast = (spell: KeptSpell) => {
      const own = kinds.get(spell.caster) ?? new Set<number>();
      kinds.set(spell.caster, own.add(spell.kind));
    };
    for (const [id, shown] of this.shown) {
      if (this.hits.length > 0) cast(shown.spell);
      if (present.has(id)) continue;
      ended(frame, shown.spell, shown.place, shown.kept, lands);
      this.shown.delete(id);
    }
    this.glides.keep(present);
    this.trails.keep(present);
    for (const hit of this.hits) {
      const foe = frame.foes.find((one) => one.id === hit.defender);
      const look = castLookOf(fight, hit.striker);
      if (foe && look) landed(frame, kinds.get(hit.striker) ?? new Set(), foe.feet, look, lands);
    }
    this.hits.length = 0;
    chainMarks(frame, this.chains, lands);
    this.chains.length = 0;
  }

  /** The jobs of the statuses that show on the world: streaks behind the Hasted, motes off the Linked, a Charged
   *  foe's crackle. */
  private statuses(fight: Fighting, frame: Frame, jobs: Job[]): void {
    const hasted = new Set<number>();
    for (const player of frame.players) {
      const { id, feet, statuses } = player;
      const far = apartFrom(frame.eye, feet);
      if ((statuses?.haste ?? 0) > 0) {
        hasted.add(id);
        const tail = this.streaks.add(id, feet, frame.clock, STREAK_S);
        jobs.push({ far, run: () => streaks(frame, tail) });
      }
      if ((statuses?.linked ?? 0) <= 0) continue;
      jobs.push({
        far,
        run: () => {
          for (const mote of risingMotes(id, feet, frame.clock))
            billboard(frame.out, GLINTS[mote.stop] ?? STAR, BLAZE, mote.at, frame.eye);
        },
      });
    }
    this.streaks.keep(hasted);
    for (const foe of frame.foes) {
      if ((fight.foes.get(foe.id)?.statuses?.charge ?? 0) <= 0) continue;
      jobs.push({ far: apartFrom(frame.eye, foe.feet), run: () => crackle(frame, foe.feet) });
    }
  }
}
