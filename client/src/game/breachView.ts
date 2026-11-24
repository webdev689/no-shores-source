// A Breach as the page plays it, a frame at a time, from what its room says of it (`BreachSeen`): in its gate's patrol
// zone, the gate's banner for everyone there (or its line beside a public event's), the gate's mark on the compass,
// and E at the gate once it is open to the player's company; in its run, its spaces, its seals while shut, the Broken
// Stair's slabs while they stand, its bells and the Lodestone as props, the encounter's banner, and E at the way out.
// In both, a ring under each Rewritten player and round each fallen one being raised, E held to raise a fallen
// company member, and the room's moments heard where they happen. The room judges it all.
import type { EventProp, PropModule } from '../city/eventProps.ts';
import { PROP_MODULES } from '../city/eventProps.ts';
import { moduleNumber } from '../city/modules.ts';
import type { PublicShown } from '../combat/publicBanner.ts';
import { markRing } from '../combat/marks.ts';
import { BREACH_EVENT, BREACH_PHASE, type BreachSeen, STONE } from '../network/breachMessages.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import type { FightEvent, SeenPlayer } from '../network/messages.ts';
import type { PlayerPlate } from '../network/plateMessages.ts';
import { fighterView } from '../rules/fighters.ts';
import type { NodeLayout } from '../layout/layouts.ts';
import { type BreachPlan, breachPlanOf, sealOpen, slabStands, socketAt, spaceSocket } from './breachPlan.ts';
import { type Mooring, breachCall, gateBanner, gateLine, inSentence, runBanner } from './breachWords.ts';
import { rosterNow } from './companyHud.ts';
import type { Use } from './footGear.ts';
import type { NodeInfo } from './worldData.ts';

type Point = readonly [number, number, number];

/** A Breach's run the player is in: its room, its tier (0 Normal, 1 Hard), its plan and its gate's patrol zone. */
export interface InBreach {
  readonly run: string;
  readonly tier: number;
  readonly plan: BreachPlan;
  readonly zone: NodeInfo;
}

/** What a Breach's view is made with: the place on foot, the run it is (none in the zone), the land's worker (the
 *  zone's layout, for where its gate stands), the ways in and out, and the room's module (the plan). */
export interface BreachParts {
  readonly zone: NodeInfo;
  readonly run: InBreach | null;
  readonly context: {
    readonly land: { layoutsNamed(ids: readonly string[]): Promise<string> };
    readonly trips: { enterBreach?(): void; leaveBreach?(): void };
  };
  readonly module: WebAssembly.Module;
}

/** What a frame reads of the room: its word on the Breach, whether Use is held, the fight (the player's number, the
 *  room's tick the slabs stand by, every other player, the way to ask), and the other players' plates (their names). */
export interface BreachOn {
  readonly seen: BreachSeen | null;
  readonly using: boolean;
  readonly fight: {
    readonly player: number;
    readonly roomTick: number;
    readonly others: ReadonlyMap<number, SeenPlayer>;
    readonly foes: ReadonlyMap<
      number,
      { readonly view: { readonly x: number; readonly y: number; readonly z: number } }
    >;
    askGear(ask: GearAsk): void;
  };
  readonly others: { plateOf(id: number): PlayerPlate | null };
}

/** What a frame of the Breach gives the zone's or the run's view. */
export interface BreachFrame {
  readonly shown: PublicShown | null;
  /** The gate in a line, for the zone's banner while another stands there. */
  readonly line: string;
  /** Whether the Breach's banner stands before any other: in its run, or by its gate. */
  readonly first: boolean;
  readonly props: EventProp[];
  readonly sounds: { readonly cue: string; readonly at: Point }[];
  readonly sting: 'cadence' | 'victory' | 'defeat' | null;
}

/** The gate's moorings, as the room names them (crates/room/src/breach/gate.rs MOORINGS), how near one a body holds
 *  it, and how near the gate's own socket E asks to enter; how near its middle the gate's banner stands first. */
const MOORINGS = ['mooring-west', 'mooring-south', 'mooring-east'] as const;
const MOORING_REACH_M = 1.7;
const GATE_REACH_M = 4;
const GATE_NEAR_M = 60;
/** How near a body E raises it (fallen.rs RAISE_REACH_M), takes up the Lodestone (lodestone.rs TAKE_REACH_M) and
 *  leaves by the way out. */
const RAISE_REACH_M = 2.5;
const TAKE_REACH_M = 2.5;
const OUT_REACH_M = 2.5;
/** How high over its bearer's feet the Lodestone is drawn, metres, and how fast it turns there, radians a second. */
const BORNE_M = 2.3;
const BORNE_TURN = 1.2;
/** The rings: the Rewritten's mark (a pale violet), a raising's fill (gold), and their sizes, metres. */
const REWRITTEN = { colour: [0.72, 0.55, 1, 0.55] as const, inner: 0.55, outer: 0.7 };
const RAISING = { colour: [1, 0.82, 0.4, 0.7] as const, inner: 0.75, outer: 0.95 };
/** The recordings each moment plays where it happens, reused from the world's own. */
const SOUNDS: Readonly<Record<number, string>> = {
  [BREACH_EVENT.begun]: 'foe.alert',
  [BREACH_EVENT.stage]: 'amb.ice.crack',
  [BREACH_EVENT.won]: 'story.crash',
  [BREACH_EVENT.revived]: 'anima.divine',
  [BREACH_EVENT.rewritten]: 'element.cosmic',
  [BREACH_EVENT.cleansed]: 'finish.cosmic',
  [BREACH_EVENT.carried]: 'element.cosmic',
  [BREACH_EVENT.unwritten]: 'story.thud',
  [BREACH_EVENT.lodestoneTaken]: 'ship.ready',
  [BREACH_EVENT.lodestoneDropped]: 'story.thud',
  [BREACH_EVENT.grounded]: 'amb.thunder.crack',
  [BREACH_EVENT.heldTrue]: 'anima.divine',
  [BREACH_EVENT.bellWoke]: 'element.cosmic',
  [BREACH_EVENT.bellBroken]: 'shield.break',
  [BREACH_EVENT.bellRang]: 'amb.thunder.crack',
  [BREACH_EVENT.fused]: 'amb.ice.crack',
  [BREACH_EVENT.overtaken]: 'hit.blunt',
  [BREACH_EVENT.claimed]: 'foe.alert',
  [BREACH_EVENT.deskMarked]: 'foe.alert',
  [BREACH_EVENT.blotted]: 'finish.cosmic',
  [BREACH_EVENT.wroteItself]: 'story.thud',
  [BREACH_EVENT.seen]: 'foe.alert',
  [BREACH_EVENT.riftOpened]: 'element.cosmic',
  [BREACH_EVENT.riftClosed]: 'amb.ice.crack',
  [BREACH_EVENT.keeperFell]: 'kill',
  [BREACH_EVENT.tolled]: 'amb.thunder.crack',
  [BREACH_EVENT.taken]: 'element.cosmic',
  [BREACH_EVENT.wayBack]: 'finish.cosmic',
  [BREACH_EVENT.returned]: 'ship.ready',
  [BREACH_EVENT.laidBare]: 'shield.break',
};
/** The music's moment for a moment of the run: a cadence as an encounter begins, victory as one is won or the Breach
 *  cleared, defeat as an attempt is lost. */
const STINGS: Readonly<Record<number, 'cadence' | 'victory' | 'defeat'>> = {
  [BREACH_EVENT.begun]: 'cadence',
  [BREACH_EVENT.won]: 'victory',
  [BREACH_EVENT.cleared]: 'victory',
  [BREACH_EVENT.wiped]: 'defeat',
};

const flat = (from: Point, to: Point) => Math.hypot(from[0] - to[0], from[1] - to[1]);
const quarter = Math.PI / 2;
const asProp = (name: string): PropModule | null =>
  (PROP_MODULES as readonly string[]).includes(name) ? (name as PropModule) : null;
const prop = (module: PropModule, where: Point, turn: number, rise = 1): EventProp => ({
  ...{ module, at: where, turn, scale: 1, rise, lid: 0, glow: 1 },
});

/** Whether another player lies fallen, by the room's word on their fighter. */
const fallen = (seen: SeenPlayer | undefined): boolean =>
  !!seen?.fighter && fighterView(seen.fighter).action.kind === 'dead';

/** How far up a slab stands at `tick`: forming over its first second, fading over the last of its seven. */
function slabRise(plan: BreachPlan, phase: number, tick: number): number {
  const into = (tick + phase) % plan.slabCycle;
  return Math.max(0, Math.min(1, into / 60, (plan.slabStands - into) / 60));
}

/** The Breach's plan from the room module; none from a module that holds none. */
function planOf(module: WebAssembly.Module): BreachPlan | null {
  try {
    return breachPlanOf(module);
  } catch {
    return null;
  }
}

/** Where a layout stood a Breach's gate: its module's middle, its quarter turns, and its area's name. */
export function gateOf(layout: NodeLayout): { at: Point; turn: number; place: string } | null {
  const gate = moduleNumber('breach-gate');
  const solid = layout.solids.find((each) => each.shape === 'module' && each.module === gate && each.group === 0);
  if (!solid) return null;
  const turn = (((Math.round(solid.turn / quarter) % 4) + 4) % 4) as number;
  return { at: solid.at, turn, place: layout.areas.find((area) => area.kind === 'breach')?.name ?? '' };
}

export class BreachView {
  private readonly parts: BreachParts;
  private readonly plan: BreachPlan | null;
  private gate: { at: Point; turn: number; place: string } | null = null;
  /** The fallen player Use was pressed to raise, until it is let go. */
  private raising: number | null = null;
  private word: BreachOn | null = null;
  private feet: Point = [0, 0, 0];

  constructor(parts: BreachParts) {
    this.parts = parts;
    const plan = parts.run?.plan ?? planOf(parts.module);
    // Only the run, or the patrol zone its gate stands in, shows the Breach.
    this.plan = parts.run || plan?.zone === parts.zone.id ? plan : null;
    if (this.plan && !parts.run)
      void parts.context.land.layoutsNamed([parts.zone.id]).then(
        (text) => (this.gate = (JSON.parse(text) as NodeLayout[]).map(gateOf).find(Boolean) ?? null),
        () => undefined,
      );
  }

  /** A gate socket's place in the world, once the zone's layout has said where the gate stands. */
  private gateSocket(name: string): Point | null {
    const gate = this.gate;
    return gate && socketAt('breach-gate', name, gate.at, gate.turn);
  }

  /** One frame at `clock` (the page's seconds): the room's word and `events` since the last, the player at `feet`,
   *  each fighter where it is drawn (`where`), the rings laid into `marks`. None outside a Breach. */
  frame(
    word: BreachOn,
    events: readonly FightEvent[],
    feet: Point,
    where: (id: number) => Point | null,
    clock: number,
    marks: number[],
  ): BreachFrame | null {
    [this.word, this.feet] = [word, feet];
    if (this.raising !== null && !word.using) {
      word.fight.askGear({ kind: ASKS.stopRaise });
      this.raising = null;
    }
    const { plan } = this;
    const seen = word.seen;
    if (!plan || !seen) return null;
    const nameOf = (player: number) =>
      player === word.fight.player ? 'you' : (word.others.plateOf(player)?.name ?? 'a companion');
    for (const marked of seen.marked) {
      const spot = marked.player === word.fight.player ? feet : where(marked.player);
      if (spot) markRing(marks, spot, REWRITTEN.inner, REWRITTEN.outer, REWRITTEN.colour);
    }
    for (const raising of seen.raising) {
      const spot = where(raising.raised);
      if (spot) markRing(marks, spot, RAISING.inner, RAISING.outer, RAISING.colour, [0, raising.share * 2 * Math.PI]);
    }
    const sounds = events.flatMap((event) => {
      const cue = SOUNDS[event.kind];
      const spot = where(event.defender) ?? where(event.striker) ?? feet;
      return cue ? [{ cue, at: spot }] : [];
    });
    const sting = events.reduce<BreachFrame['sting']>((last, event) => STINGS[event.kind] ?? last, null);
    const call = breachCall(seen, word.fight.player);
    const beat = events.some((event) => event.kind === BREACH_EVENT.begun || event.kind === BREACH_EVENT.stage)
      ? 'stage'
      : events.some((event) => event.kind === BREACH_EVENT.won)
        ? 'won'
        : events.some((event) => event.kind === BREACH_EVENT.wiped)
          ? 'failed'
          : null;
    if (seen.gate) {
      const gate = this.gate;
      const places = gate ? [{ x: gate.at[0], y: gate.at[1], kind: 'breach' as const }] : [];
      const banner = gateBanner(plan, seen, gate?.place ?? '', this.moorings(seen), this.openToMe(seen));
      const near = !!gate && flat(feet, gate.at) <= GATE_NEAR_M;
      const shown: PublicShown = { banner, beat, places, stores: [], call };
      return { shown, line: gateLine(plan, seen), first: near, props: [], sounds, sting };
    }
    const banner = runBanner(plan, seen, nameOf);
    const mood = seen.encounter > 0 ? ('tension' as const) : null;
    const shown: PublicShown = { banner, beat, places: [], stores: [], call, mood };
    return { shown, line: '', first: true, props: this.runProps(plan, seen, word, where, clock), sounds, sting };
  }

  /** Each of the gate's moorings: claimed by the Lattice (the room's word), held by a living player standing on it,
   *  or free. */
  private moorings(seen: BreachSeen): Mooring[] {
    const bodies = this.living();
    return MOORINGS.map((name, nth) => {
      if ((seen.claims & (1 << nth)) !== 0) return 'claimed';
      const spot = this.gateSocket(name);
      return spot && bodies.some((body) => flat(body, spot) <= MOORING_REACH_M) ? 'held' : 'free';
    });
  }

  /** Where each living player stands: the player and every other the room counts living. */
  private living(): Point[] {
    const word = this.word;
    if (!word) return [];
    const others = [...word.fight.others.values()].filter((seen) => !fallen(seen) && seen.fighter);
    return [this.feet, ...others.map((seen): Point => [seen.body.x, seen.body.y, seen.body.z])];
  }

  private openToMe(seen: BreachSeen): boolean {
    return !!this.word && seen.openTo.includes(this.word.fight.player);
  }

  /** The run's props: its spaces where its plan stands them, each seal while shut, each slab while it stands, a
   *  crystal at each bell, and the Lodestone on its plinth, lying, or over its bearer, turning. */
  private runProps(
    plan: BreachPlan,
    seen: BreachSeen,
    word: BreachOn,
    where: (id: number) => Point | null,
    clock: number,
  ): EventProp[] {
    const props: EventProp[] = [];
    for (const space of plan.spaces) {
      const module = asProp(space.module);
      if (module) props.push(prop(module, space.at, space.turn * quarter));
    }
    plan.seals.forEach((seal, number) => {
      if (seal.at && !sealOpen(seen.seals, number)) props.push(prop('breach-seal', seal.at, seal.turn * quarter));
    });
    const tick = word.fight.roomTick;
    for (const slab of plan.slabs)
      if (slab.at && slabStands(plan, slab.phase, tick))
        props.push(prop('breach-slab', slab.at, 0, slabRise(plan, slab.phase, tick)));
    // A bell is no figure, so it stands where the room last stood its foe.
    for (const bell of seen.bellFoes) {
      const kept = word.fight.foes.get(bell)?.view;
      if (kept) props.push(prop('breach-bell', [kept.x, kept.y, kept.z], 0));
    }
    const bearer = seen.stone === STONE.borne ? where(seen.bearer) : null;
    if (bearer) props.push(prop('breach-lodestone', [bearer[0], bearer[1], bearer[2] + BORNE_M], clock * BORNE_TURN));
    else if (seen.stone === STONE.plinth || seen.stone === STONE.lying)
      props.push(prop('breach-lodestone', seen.stoneAt, 0));
    return props;
  }

  /** What E does at the player's feet in a Breach: raises a fallen company member in reach while held, takes up or
   *  sets down the Lodestone, enters the run at the gate once it is open to the player's company, or leaves the run
   *  by the way in, or by the court's portal once the Breach is cleared. */
  use(feet: Point, ask: (asked: GearAsk) => void): Use | null {
    const [plan, word] = [this.plan, this.word];
    const seen = word?.seen;
    if (!plan || !word || !seen) return null;
    const raise = this.raisable(seen, feet);
    if (raise !== null) {
      const name = word.others.plateOf(raise)?.name ?? 'them';
      return {
        words: `Hold to raise ${name}`,
        run: () => {
          this.raising = raise;
          ask({ kind: ASKS.raise, item: raise });
        },
      };
    }
    if (seen.stone === STONE.borne && seen.bearer === word.fight.player)
      return { words: 'Set down the Lodestone', run: () => ask({ kind: ASKS.dropLodestone }) };
    const lies = seen.stone === STONE.plinth || seen.stone === STONE.lying;
    if (lies && flat(feet, seen.stoneAt) <= TAKE_REACH_M && Math.abs(feet[2] - seen.stoneAt[2]) <= 2)
      return { words: 'Take up the Lodestone', run: () => ask({ kind: ASKS.takeLodestone }) };
    const trips = this.parts.context.trips;
    if (seen.gate) {
      const gate = this.gateSocket('gate');
      const near = gate && flat(feet, gate) <= GATE_REACH_M;
      return near && this.openToMe(seen)
        ? { words: `Enter ${inSentence(plan.name)}`, run: () => trips.enterBreach?.() }
        : null;
    }
    const cleared = seen.phases.length > 0 && seen.phases.every((phase) => phase === BREACH_PHASE.won);
    const ways = [spaceSocket(plan, 'descent', 'entry'), cleared ? spaceSocket(plan, 'court', 'portal') : null];
    const out = ways.some((way) => way && flat(feet, way) <= OUT_REACH_M && Math.abs(feet[2] - way[2]) <= 3);
    return out ? { words: `Leave ${inSentence(plan.name)}`, run: () => trips.leaveBreach?.() } : null;
  }

  /** A fallen company member within reach of `feet`, the nearest: anyone in the run (it holds only its company), and
   *  at the gate one the Roster names in the player's company. */
  private raisable(seen: BreachSeen, feet: Point): number | null {
    const word = this.word;
    if (!word) return null;
    const company = new Set((rosterNow()?.company?.members ?? []).map((member) => member.name));
    let nearest: { id: number; apart: number } | null = null;
    for (const [id, other] of word.fight.others) {
      if (!fallen(other) || other.standing.kind === 'dead') continue;
      if (seen.gate && !company.has(word.others.plateOf(id)?.name ?? '')) continue;
      const apart = flat(feet, [other.body.x, other.body.y, other.body.z]);
      if (apart <= RAISE_REACH_M && (!nearest || apart < nearest.apart)) nearest = { id, apart };
    }
    return nearest?.id ?? null;
  }
}

/** What the fight's display shows of the place's events with a Breach's beside them: the Breach's banner where it
 *  stands first (in its run, or by its gate) or where nothing else shows, else the other's with the gate's line under
 *  it; the compass marking both's places, and the Breach's call where the other has none. */
export function withBreach(own: PublicShown | null, breached: BreachFrame | null): PublicShown | null {
  const theirs = breached?.shown;
  if (!breached || !theirs) return own;
  if (breached.first || !own?.banner) return { ...theirs, places: [...theirs.places, ...(own?.places ?? [])] };
  const elsewhere = [own.banner.elsewhere, breached.line].filter(Boolean).join(' · ');
  return {
    ...own,
    banner: { ...own.banner, elsewhere },
    places: [...own.places, ...theirs.places],
    call: own.call ?? theirs.call ?? null,
  };
}
