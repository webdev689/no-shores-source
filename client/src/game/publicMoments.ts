// The moments the page plays round a zone's public event between and beside the room's own beats, worked out frame by
// frame from the event as it was and as it is: the heroic chance announced, the next event starting soon, the Lattice
// pouring out and a shard set (the crack flaring, the ground trembling, the shard arcing in), the seal's shock, a
// store under attack, the last ten seconds ticking, a raid won toppling its banners, and the chests lying. PublicView
// lays them into its frame; the marks they draw on the ground and over it are laid here.
import { EVENT } from '../combat/cues.ts';
import { markLine } from '../combat/drops.ts';
import { markRing } from '../combat/marks.ts';
import type { BannerBeat } from '../combat/publicBanner.ts';
import { type ChestLike, type EventProp, type PropModule, type PropMoments, turnOf } from '../city/eventProps.ts';
import type { FightEvent } from '../network/messages.ts';
import { HEROIC, MARK, PUBLIC_KIND, PUBLIC_PHASE, type PublicEvent } from '../network/publicMessages.ts';
import { TICKS_A_SECOND } from './hudLaw.ts';
import { CHEST_LIES_S } from './publicLaw.ts';

type Point = readonly [number, number, number];

/** The last minute's and the last ten seconds' ticks. */
const LAST_MINUTE_TICKS = 60 * TICKS_A_SECOND;
const LAST_TEN_TICKS = 10 * TICKS_A_SECOND;
/** What the heroic chance calls as it opens, by event, and how long the call stands in the banner, seconds. */
const CALLS: Readonly<Record<number, string>> = {
  [PUBLIC_KIND.fissure]: 'A crystal growth rises: break it!',
  [PUBLIC_KIND.raid]: 'The tithe-taker has come to count: kill him before he goes',
};
const CALL_S = 5;
/** How the crack flares at a beat: as strong as each says, dying away over FLARE_S; the seal's flash is the light. */
const FLARE_S = 1.2;
const FLARES = { poured: 1, set: 0.6, sealed: 3 } as const;
/** How hard the ground trembles under the player at each beat (0 to 1), dying to nothing this far off, metres. */
const TREMORS = { poured: [0.45, 60], set: [0.15, 25], sealed: [0.8, 120] } as const;
/** A shard set arcs from its carrier's hand into the crack over this long, seconds, this high at its top, metres. */
const FLIGHT = { seconds: 0.4, arcM: 1.2, handM: 0.95, scale: 0.8 } as const;
/** How fast the fissure's width follows the room's, a share of the gap a second. */
const OPEN_EASE = 2.5;
/** How long a raid's banners take to topple once it is won, seconds. */
const TOPPLE_S = 1.4;
/** A store struck within this long is under attack, seconds. */
const STRUCK_S = 1.5;
/** The seal's shock ring: how long it spreads, how far, how wide its band, metres. */
const SHOCK = { seconds: 1.6, reachM: 45, widthM: 1.2 } as const;
/** The marks over and on the ground: a heroic target's orange pillar, the gold beacon over the ground for a player
 *  outside it, a chest's pillar (gold, orange for a heroic one), the fissure's lip round a carrier, a store's ring. */
const MARKS = {
  heroic: { colour: [1, 0.48, 0.24] as const, heightM: 9, strength: 0.95 },
  beacon: { colour: [0.95, 0.74, 0.3] as const, heightM: 60, strength: 0.8 },
  chest: { gold: [0.95, 0.74, 0.3] as const, heroic: [1, 0.48, 0.24] as const, heightM: 5, strength: 0.8 },
  lip: { radiusM: 6, widthM: 0.25, colour: [1, 0.36, 0.4, 0.22] as const },
  store: { radiusM: 2.6, widthM: 0.3, attack: [0.9, 0.24, 0.2, 0.6] as const, count: [1, 0.48, 0.24, 0.5] as const },
} as const;

/** What a frame's moments add: a beat of the page's own, the sounds and where (a chime heard by the player alone
 *  as a rarity's), the last ten seconds' tick, how hard the ground trembles, the heroic chance's call, what they do to
 *  the props, the shards in flight, the stores under attack, and each chest's seconds left to lie. */
export interface Moments {
  readonly beat: BannerBeat | null;
  readonly sounds: { readonly cue: string; readonly at: Point }[];
  readonly chime: number | null;
  readonly tick: boolean;
  readonly tremor: number;
  readonly call: string | null;
  readonly props: PropMoments;
  readonly flights: EventProp[];
  readonly struck: ReadonlySet<number>;
  readonly chestsLeft: ReadonlyMap<number, number>;
}

/** A frame's moments with no event to play them. */
const QUIET: Moments = {
  beat: null,
  sounds: [],
  chime: null,
  tick: false,
  tremor: 0,
  call: null,
  props: { flare: 0, open: null, topple: 0 },
  flights: [],
  struck: new Set(),
  chestsLeft: new Map(),
};

const fade = ([strength, reach]: readonly [number, number], from: Point, heard: Point) =>
  strength * Math.max(0, 1 - Math.hypot(heard[0] - from[0], heard[1] - from[1]) / reach);
const ease = (share: number) => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};
const running = (event: PublicEvent | null) =>
  !!event && event.kind !== PUBLIC_KIND.none && event.phase === PUBLIC_PHASE.running;

/** The moments of one zone's events, kept from frame to frame. */
export class PublicMoments {
  private before: PublicEvent | null = null;
  private clock: number | null = null;
  private chanceAt = -Infinity;
  private readonly flares: { readonly at: number; readonly strength: number }[] = [];
  private flights: { readonly from: Point; readonly to: Point; readonly at: number; readonly id: number }[] = [];
  private open: number | null = null;
  private wonAt: number | null = null;
  private shockAt: { readonly at: Point; readonly clock: number } | null = null;
  private readonly stores = new Map<number, { readonly health: number; readonly struck: number }>();
  private readonly chestsSeen = new Map<number, number>();

  /** The moments at `clock` of `event` (its `events` since the last frame, none for a frame back from a hidden tab),
   *  heard by a player at `feet`; `where` finds a fighter as drawn, `chests` are the player's lying, each counted down
   *  on the wall's seconds (`wall`), as the room counts it. */
  frame(
    event: PublicEvent | null,
    events: readonly FightEvent[],
    feet: Point,
    where: (id: number) => Point | null,
    chests: readonly ChestLike[],
    clock: number,
    wall: number,
  ): Moments {
    // A frame with no event (before the room's first word, or while it is lost) keeps all as it was: on its return
    // no chest thumps in again and none of its time is counted afresh.
    if (!event) return QUIET;
    const before = this.before;
    const seconds = this.clock === null ? 0 : clock - this.clock;
    const first = this.clock === null;
    [this.before, this.clock] = [event, clock];
    const sounds: { cue: string; at: Point }[] = [];
    let [beat, chime, tremor]: [BannerBeat | null, number | null, number] = [null, null, 0];
    const fissure = event?.marks.find((mark) => mark.kind === MARK.fissure)?.at ?? event?.ground ?? feet;
    const flare = (strength: number) => this.flares.push({ at: clock, strength });
    // The heroic chance opens: called in the banner, heard where its target stands.
    if (event && before && before.heroic === HEROIC.notYet && event.heroic === HEROIC.offered) {
      const target = event.marks.find((mark) => mark.kind === MARK.growth || mark.kind === MARK.titheTaker);
      [beat, this.chanceAt] = ['chance', clock];
      sounds.push({ cue: 'cast.charge', at: target?.at ?? event.ground });
    }
    // The next event a minute off, and its start: a beat and a chime heard all over the zone.
    const soon = (seen: PublicEvent | null) => !!seen && !running(seen) && seen.nextTicks <= LAST_MINUTE_TICKS;
    const begun = events.some((each) => each.kind === EVENT.publicBegun);
    if ((event && before && soon(event) && !soon(before) && before.nextTicks > 0) || begun) {
      beat = begun ? beat : 'soon';
      chime = 2;
      sounds.push({ cue: 'drop.land', at: feet });
    }
    for (const each of events) {
      if (event?.kind === PUBLIC_KIND.fissure && (each.kind === EVENT.publicBegun || each.kind === EVENT.publicStage)) {
        flare(FLARES.poured);
        tremor = Math.max(tremor, fade(TREMORS.poured, fissure, feet));
      } else if (each.kind === EVENT.shardSet) {
        flare(FLARES.set);
        tremor = Math.max(tremor, fade(TREMORS.set, fissure, feet));
        const hand = where(each.striker);
        if (hand) this.flights.push({ from: hand, to: fissure, at: clock, id: each.striker });
      } else if (each.kind === EVENT.publicWon && event?.kind === PUBLIC_KIND.fissure) {
        flare(FLARES.sealed);
        tremor = Math.max(tremor, fade(TREMORS.sealed, fissure, feet));
        this.shockAt = { at: fissure, clock };
      } else if (each.kind === EVENT.publicWon && event?.kind === PUBLIC_KIND.raid) {
        sounds.push({ cue: 'story.flash', at: event.ground });
      } else if (each.kind === EVENT.publicFailed && event?.kind === PUBLIC_KIND.raid) {
        sounds.push({ cue: 'story.crash', at: event.ground });
      }
    }
    // The last ten seconds tick, once a second.
    const tick =
      running(event) &&
      !!before &&
      !!event &&
      event.ticksLeft <= LAST_TEN_TICKS &&
      Math.ceil(event.ticksLeft / TICKS_A_SECOND) < Math.ceil(before.ticksLeft / TICKS_A_SECOND);
    // A raid won topples its banners; one already won when the page came stands toppled.
    if (event?.kind === PUBLIC_KIND.raid && event.phase === PUBLIC_PHASE.won)
      this.wonAt ??= before?.phase === PUBLIC_PHASE.running ? clock : -Infinity;
    else this.wonAt = null;
    // The fissure's width follows the room's at a pace, so a shard set eases it.
    const room = event?.marks.find((mark) => mark.kind === MARK.fissure)?.health ?? null;
    this.open =
      room === null || this.open === null ? room : this.open + (room - this.open) * Math.min(1, seconds * OPEN_EASE);
    // A store losing health is under attack.
    const struck = new Set<number>();
    for (const mark of event?.marks ?? []) {
      if (mark.kind !== MARK.store) continue;
      const known = this.stores.get(mark.id);
      const hit = !!known && mark.health < known.health && mark.health > 0;
      this.stores.set(mark.id, { health: mark.health, struck: hit ? clock : (known?.struck ?? -Infinity) });
      if (clock - (this.stores.get(mark.id)?.struck ?? -Infinity) < STRUCK_S && mark.health > 0) struck.add(mark.id);
    }
    if (!running(event)) this.stores.clear();
    // A chest coming thumps in; each lies its two minutes from then (one there as the page came, from then too).
    const chestsLeft = new Map<number, number>();
    for (const chest of chests) {
      if (!this.chestsSeen.has(chest.id)) {
        this.chestsSeen.set(chest.id, wall);
        if (!first) sounds.push({ cue: 'drop.land', at: chest.at });
      }
      chestsLeft.set(chest.id, CHEST_LIES_S - (wall - (this.chestsSeen.get(chest.id) ?? wall)));
    }
    for (const id of this.chestsSeen.keys()) if (!chests.some((chest) => chest.id === id)) this.chestsSeen.delete(id);
    const flareNow = this.flares.reduce(
      (most, each) => Math.max(most, each.strength * Math.max(0, 1 - (clock - each.at) / FLARE_S)),
      0,
    );
    this.flares.splice(0, this.flares.length, ...this.flares.filter((each) => clock - each.at < FLARE_S));
    this.flights = this.flights.filter((each) => clock - each.at < FLIGHT.seconds);
    const offered = event?.heroic === HEROIC.offered;
    return {
      beat,
      sounds,
      chime,
      tick,
      tremor,
      call: offered && clock - this.chanceAt < CALL_S ? (CALLS[event.kind] ?? null) : null,
      props: {
        flare: flareNow,
        open: this.open,
        topple: this.wonAt === null ? 0 : (clock - this.wonAt) / TOPPLE_S,
      },
      flights: this.flights.map((each) => flightProp(each, clock)),
      struck,
      chestsLeft,
    };
  }

  /** The marks of the moments, laid into `marks` seen from `eye`: the heroic target's pillar, the beacon for a player
   *  outside the ground, each chest's pillar, the fissure's lip round a player carrying a shard, a store's ring under
   *  attack (filling as it is plundered) or counted, and the seal's shock spreading. */
  lay(
    event: PublicEvent | null,
    moments: Moments,
    chests: readonly ChestLike[],
    player: number,
    feet: Point,
    marks: number[],
    clock: number,
    eye: Point,
  ): void {
    const pillar = (foot: Point, look: { heightM: number; strength: number }, colour: readonly number[]) =>
      markLine(marks, [foot[0], foot[1], foot[2] + 0.5], look.heightM, colour, look.strength, clock, eye);
    if (event?.heroic === HEROIC.offered && running(event))
      for (const mark of event.marks)
        if (mark.kind === MARK.growth || mark.kind === MARK.titheTaker)
          pillar(mark.at, MARKS.heroic, MARKS.heroic.colour);
    if (event) {
      const [ground, waiting] = running(event) ? [event.ground, false] : [event.nextGround, true];
      const outside = Math.hypot(feet[0] - ground[0], feet[1] - ground[1]) > event.radius;
      const shown = waiting ? event.nextKind !== PUBLIC_KIND.none && event.nextTicks <= LAST_MINUTE_TICKS : true;
      if (outside && shown && (waiting || running(event))) pillar(ground, MARKS.beacon, MARKS.beacon.colour);
    }
    for (const chest of chests)
      if (chest.opened === null) pillar(chest.at, MARKS.chest, chest.tier >= 3 ? MARKS.chest.heroic : MARKS.chest.gold);
    const marked = event?.marks ?? [];
    const fissure = marked.find((mark) => mark.kind === MARK.fissure);
    if (fissure && marked.some((mark) => mark.kind === MARK.carried && mark.id === player)) {
      const { radiusM, widthM, colour } = MARKS.lip;
      markRing(marks, fissure.at, radiusM - widthM, radiusM, colour);
    }
    const stores = marked.filter((mark) => mark.kind === MARK.store);
    const ring = (middle: Point, colour: readonly [number, number, number, number], share: number) =>
      markRing(marks, middle, MARKS.store.radiusM - MARKS.store.widthM, MARKS.store.radiusM, colour, [
        0,
        2 * Math.PI * Math.min(1, Math.max(0.02, share)),
      ]);
    for (const store of stores) if (moments.struck.has(store.id)) ring(store.at, MARKS.store.attack, 1 - store.health);
    const taker = marked.find((mark) => mark.kind === MARK.titheTaker && mark.state === 2);
    const counted =
      taker &&
      stores.reduce<(typeof stores)[number] | null>(
        (best, store) =>
          !best ||
          Math.hypot(store.at[0] - taker.at[0], store.at[1] - taker.at[1]) <
            Math.hypot(best.at[0] - taker.at[0], best.at[1] - taker.at[1])
            ? store
            : best,
        null,
      );
    if (counted) ring(counted.at, MARKS.store.count, 1);
    const shock = this.shockAt;
    if (shock && clock - shock.clock < SHOCK.seconds) {
      const share = (clock - shock.clock) / SHOCK.seconds;
      const reach = SHOCK.reachM * ease(share);
      const colour = [1, 0.4, 0.45, 0.7 * (1 - share)] as const;
      markRing(marks, shock.at, Math.max(0, reach - SHOCK.widthM), reach, colour);
    }
  }
}

/** A shard in flight from a carrier's hand into the crack, `clock` into its arc. */
function flightProp(flight: { from: Point; to: Point; at: number; id: number }, clock: number): EventProp {
  const share = Math.min(1, (clock - flight.at) / FLIGHT.seconds);
  const along = (axis: number) =>
    (flight.from[axis] ?? 0) + ((flight.to[axis] ?? 0) - (flight.from[axis] ?? 0)) * share;
  const lift = FLIGHT.handM * (1 - share) + FLIGHT.arcM * 4 * share * (1 - share);
  const now: Point = [along(0), along(1), along(2) + lift];
  const module: PropModule = 'lattice-shard';
  return { module, at: now, turn: turnOf(flight.id) + share * 6, scale: FLIGHT.scale, rise: 1, lid: 0, glow: 1.5 };
}
