// A Breach as the page plays it, a frame at a time, from what its room says of it (`BreachSeen`): in its gate's patrol
// zone, the gate's banner for everyone there (or its line beside a public event's), the gate's mark on the compass,
// and E at the gate once it is open to the player's company; in its run, its spaces, its seals while shut, the Broken
// Stair's slabs while they stand, its bells, the Lodestone and the hidden chests open as props, the encounter's banner
// and marks (`breachMarks.ts`), the compass's places, and E at the way out. In both, a ring under each Rewritten player
// and round each fallen one being raised, E held to raise a fallen company member, how the fallen stand again, and the
// room's moments heard (and some told) where they happen. The room judges it all.
import type { EventProp, PropModule } from '../city/eventProps.ts';
import { PROP_MODULES, chestProps } from '../city/eventProps.ts';
import { moduleNumber } from '../city/modules.ts';
import { EVENT } from '../combat/cues.ts';
import type { StandingAgain } from '../combat/hudPlace.ts';
import type { PublicShown } from '../combat/publicBanner.ts';
import { markRing } from '../combat/marks.ts';
import { BREACH_EVENT, BREACH_PHASE, type BreachSeen, STONE } from '../network/breachMessages.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import type { FightEvent, SeenPlayer } from '../network/messages.ts';
import type { PlayerPlate } from '../network/plateMessages.ts';
import { fighterView } from '../rules/fighters.ts';
import type { NodeLayout } from '../layout/layouts.ts';
import { type MarkedFoe, mooringMark, runMarks } from './breachMarks.ts';
import { type BreachPlan, breachPlanOf, sealOpen, slabStands, socketAt, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER, type Mooring, breachCall, encounterOn, gateBanner, gateLine } from './breachWords.ts';
import { inSentence, momentWords, runBanner } from './breachWords.ts';
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
    readonly trips: { enterBreach?(): void; leaveBreach?(): void; tell?(words: string): void };
  };
  readonly module: WebAssembly.Module;
}

/** What a frame reads of the room: its word on the Breach, whether Use is held, the fight (the player's number and
 *  their own fighter, the room's tick the slabs stand by, every other player and foe, the way to ask), the other
 *  players' plates (their names), and the room's last answer to the player's asks. */
export interface BreachOn {
  readonly seen: BreachSeen | null;
  readonly using: boolean;
  readonly fight: {
    readonly player: number;
    readonly own: { readonly action: { readonly kind: string } } | null;
    readonly roomTick: number;
    readonly others: ReadonlyMap<number, SeenPlayer>;
    readonly foes: ReadonlyMap<number, { readonly view: MarkedFoe }>;
    askGear(ask: GearAsk): void;
  };
  readonly others: { plateOf(id: number): PlayerPlate | null };
  readonly gear?: { readonly answered: number; readonly answer: number } | null;
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
/** How far the gate's hollow reaches from its middle (gate.rs HOLLOW_M): its company fights the Waking there, and
 *  the Waking's moments are heard there. */
const HOLLOW_M = 45;
/** How long the fallen lie before standing again of themselves, ticks (fallen.rs): outside a running encounter, and
 *  inside one at Normal. */
const STANDS_OUTSIDE = 6 * 60;
const STANDS_INSIDE = 10 * 60;
/** The room's answers to a raising refused (fallen.rs): no revive left, none fallen in reach. */
const NO_REVIVES = 110;
const NONE_TO_RAISE = 111;
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
/** The music's moment for a moment of the run: a cadence as an encounter begins or its great foe wakes (as an Elite
 *  Dungeon's Boss does), victory as one is won or the Breach cleared, defeat as an attempt is lost. */
const STINGS: Readonly<Record<number, 'cadence' | 'victory' | 'defeat'>> = {
  [BREACH_EVENT.begun]: 'cadence',
  [EVENT.bossWoke]: 'cadence',
  [BREACH_EVENT.won]: 'victory',
  [BREACH_EVENT.cleared]: 'victory',
  [BREACH_EVENT.wiped]: 'defeat',
};
/** The moments the room tells once, of one player (`defender`); every other it tells each player in the room, so
 *  the page takes only its own player's. */
const TOLD_ONCE: ReadonlySet<number> = new Set([
  BREACH_EVENT.revived,
  BREACH_EVENT.cleansed,
  BREACH_EVENT.carried,
  BREACH_EVENT.lodestoneTaken,
  BREACH_EVENT.lodestoneDropped,
  BREACH_EVENT.grounded,
  BREACH_EVENT.heldTrue,
  BREACH_EVENT.overtaken,
]);
/** The Waking's own moments at the gate, heard and told only by its company and those in its hollow. */
const WAKING: ReadonlySet<number> = new Set([BREACH_EVENT.begun, BREACH_EVENT.won, BREACH_EVENT.wiped]);
/** The stages the fallen stand again at, by `reached` (mod.rs STAGES), and the hidden chests by their sockets, each
 *  open as the room pays it (mod.rs keep_chests): the Descent's and the Stair's always, the page's once the Choir is
 *  won with its bit in `chests`, the heart's with its own. */
const STAGES = [
  ['descent', 'start'],
  ['mending', 'checkpoint'],
  ['choir', 'checkpoint'],
  ['ways', 'checkpoint'],
  ['stair', 'start'],
  ['hall', 'checkpoint'],
  ['court', 'checkpoint'],
] as const;
const HIDDEN_CHESTS = [
  { space: 'descent', socket: 'chest-descent', open: () => true },
  { space: 'choir', socket: 'chest-page', open: (seen: BreachSeen) => chestBit(seen, 1) && seen.phases[2] === 2 },
  { space: 'ways', socket: 'heart', open: (seen: BreachSeen) => chestBit(seen, 2) },
  { space: 'stair', socket: 'chest-stair', open: () => true },
] as const;
/** How long ago a chest shown open was opened, seconds: long enough that its lid stands thrown back. */
const LONG_OPEN_S = 60;
/** The way out once the Breach is cleared, the court's portal, ringed as a dungeon's lit portal shows the way. */
const PORTAL = { colour: [0.72, 0.55, 1, 0.7] as const, inner: 2.2, outer: 2.5 };
/** The Shores' rifts in the hall, by their number. */
const RIFTS = ['rift-was', 'rift-is'] as const;

const flat = (from: Point, to: Point) => Math.hypot(from[0] - to[0], from[1] - to[1]);
const chestBit = (seen: BreachSeen, bit: number) => (seen.chests & (1 << bit)) !== 0;
const quarter = Math.PI / 2;
const asProp = (name: string): PropModule | null =>
  (PROP_MODULES as readonly string[]).includes(name) ? (name as PropModule) : null;
const prop = (module: PropModule, where: Point, turn: number, rise = 1): EventProp => ({
  ...{ module, at: where, turn, scale: 1, rise, lid: 0, glow: 1 },
});

/** Whether another player lies fallen, by the room's word on their fighter. */
const fallen = (seen: SeenPlayer | undefined): boolean =>
  !!seen?.fighter && fighterView(seen.fighter).action.kind === 'dead';

/** How the fallen stand again where the player numbered `player` stands at `feet`, by the room's rules (fallen.rs
 *  `stands_after`): in a run, after a while outside a running encounter, after longer inside one at Normal, never of
 *  themselves inside one at Hard; at the gate, as inside an encounter for the company holding it while its Waking runs
 *  and they are in its hollow (by the gate at `gateAt`); null where the place's own rules stand them, as anywhere else.
 *  The revives are the attempt's, or the Waking's, left to raise them (-1 none counted). */
export function breachFall(seen: BreachSeen, player: number, feet: Point, gateAt: Point | null): StandingAgain | null {
  const inside = { ticks: seen.tier === 1 ? null : STANDS_INSIDE, revives: seen.revives };
  if (!seen.gate) return seen.encounter > 0 ? inside : { ticks: STANDS_OUTSIDE, revives: seen.revives };
  const waking = seen.heldBy && !seen.woken && seen.holders.includes(player);
  return waking && gateAt && flat(feet, gateAt) <= HOLLOW_M ? inside : null;
}

/** Whether the player numbered `player` bears the Lodestone, and whether its grounding is charged; null while not. */
export function bearing(seen: BreachSeen | null, player: number): { readonly charged: boolean } | null {
  return seen?.stone === STONE.borne && seen.bearer === player ? { charged: seen.charge >= 1 } : null;
}

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
  /** The fallen player Use was pressed to raise, until it is let go; the room's count of answers as it was asked. */
  private raising: number | null = null;
  private asked: number | null = null;
  private word: BreachOn | null = null;
  private feet: Point = [0, 0, 0];
  /** The gate's holders as the last frame had them: the snapshot the Waking is lost in holds none. */
  private holders: readonly number[] = [];

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
    this.heedRaising(word);
    const own = word.fight.player;
    const nameOf = (player: number) => (player === own ? 'you' : (word.others.plateOf(player)?.name ?? 'a companion'));
    for (const marked of seen.marked) {
      const spot = marked.player === own ? feet : where(marked.player);
      if (spot) markRing(marks, spot, REWRITTEN.inner, REWRITTEN.outer, REWRITTEN.colour);
    }
    for (const raising of seen.raising) {
      const spot = where(raising.raised);
      if (spot) markRing(marks, spot, RAISING.inner, RAISING.outer, RAISING.colour, [0, raising.share * 2 * Math.PI]);
    }
    // At the gate the Waking's moments are its company's, and theirs who stand in its hollow.
    const company = seen.gate ? [...new Set([...seen.holders, ...this.holders])] : [own, ...word.fight.others.keys()];
    this.holders = seen.holders;
    const hears = !seen.gate || company.includes(own) || (!!this.gate && flat(feet, this.gate.at) <= HOLLOW_M);
    const told = events.filter(
      (event) => (TOLD_ONCE.has(event.kind) || event.defender === own) && (hears || !WAKING.has(event.kind)),
    );
    const sounds = told.flatMap((event) => {
      const cue = SOUNDS[event.kind];
      return cue ? [{ cue, at: this.placeOf(plan, seen, event, where) }] : [];
    });
    // Its moments are told in words to the company alone.
    for (const event of company.includes(own) ? told : []) {
      const words = momentWords(event, company.length, nameOf);
      if (words) this.parts.context.trips.tell?.(words);
    }
    const sting = told.reduce<BreachFrame['sting']>((last, event) => STINGS[event.kind] ?? last, null);
    const call = breachCall(seen, own);
    const beat = told.some((event) => event.kind === BREACH_EVENT.begun || event.kind === BREACH_EVENT.stage)
      ? 'stage'
      : told.some((event) => event.kind === BREACH_EVENT.won)
        ? 'won'
        : told.some((event) => event.kind === BREACH_EVENT.wiped)
          ? 'failed'
          : null;
    if (seen.gate) {
      const gate = this.gate;
      const places = gate ? [{ x: gate.at[0], y: gate.at[1], kind: 'breach' as const }] : [];
      const moorings = this.moorings(seen);
      moorings.forEach((state, nth) => {
        const spot = this.gateSocket(MOORINGS[nth] ?? '');
        if (spot && !seen.woken) mooringMark(marks, spot, state);
      });
      // The Lattice's crystal seals the gate's doorway but to the company it opened to.
      const door = this.gateSocket('gate');
      const props = door && gate && !this.openToMe(seen) ? [prop('breach-seal', door, gate.turn * quarter)] : [];
      const first = seen.holders[0];
      const holding = first === undefined ? '' : first === own ? 'Your company' : nameOf(first);
      const banner = gateBanner(plan, seen, gate?.place ?? '', moorings, this.openToMe(seen), holding);
      const near = !!gate && flat(feet, gate.at) <= GATE_NEAR_M;
      const shown: PublicShown = { banner, beat, places, stores: [], call };
      return { shown, line: gateLine(plan, seen), first: near, props, sounds, sting };
    }
    const foes = [...word.fight.foes.values()].map((foe) => foe.view);
    runMarks(plan, seen, marks, { feet, living: this.living(), foes });
    const portal = seen.phases.length > 0 && seen.phases.every((phase) => phase === BREACH_PHASE.won);
    const way = portal ? spaceSocket(plan, 'court', 'portal') : null;
    if (way) markRing(marks, way, PORTAL.inner, PORTAL.outer, PORTAL.colour);
    const banner = runBanner(plan, seen, nameOf);
    // A great foe awake (the Scrivener, the Steward) is the music's peak, as an Elite Dungeon's Boss is.
    const great = seen.boss > 0 && (seen.encounter === ENCOUNTER.choir || seen.encounter === ENCOUNTER.steward);
    const mood = great ? ('peak' as const) : seen.encounter > 0 ? ('tension' as const) : null;
    const shown: PublicShown = { banner, beat, places: this.runPlaces(plan, seen), stores: [], call, mood };
    return { shown, line: '', first: true, props: this.runProps(plan, seen, word, where, clock), sounds, sting };
  }

  /** How the player stands again if they fall where they stand now (`breachFall`); null outside a Breach. */
  fall(): StandingAgain | null {
    const seen = this.word?.seen;
    if (!this.plan || !this.word || !seen) return null;
    return breachFall(seen, this.word.fight.player, this.feet, this.gate?.at ?? null);
  }

  /** Where a moment is heard: where the one it tells of stands, the place its number names (a bell's, a mooring, a
   *  rift, a desk), the gate for the Waking's own, or else at the player's feet. */
  private placeOf(plan: BreachPlan, seen: BreachSeen, event: FightEvent, where: (id: number) => Point | null): Point {
    const feet = this.feet;
    if (TOLD_ONCE.has(event.kind)) return where(event.defender) ?? where(event.striker) ?? feet;
    const nth = Math.round(event.amount);
    const bells = seen.encounter === ENCOUNTER.steward ? plan.shores['steward']?.[seen.awayShore] : 'choir';
    switch (event.kind) {
      case BREACH_EVENT.bellWoke:
      case BREACH_EVENT.bellBroken:
        return (bells && spaceSocket(plan, bells, `bell-${nth + 1}`)) || feet;
      case BREACH_EVENT.claimed:
        return this.gateSocket(MOORINGS[nth] ?? '') ?? feet;
      case BREACH_EVENT.riftOpened:
      case BREACH_EVENT.riftClosed:
      case BREACH_EVENT.keeperFell:
        return spaceSocket(plan, 'hall', RIFTS[nth] ?? '') ?? feet;
      case BREACH_EVENT.deskMarked:
      case BREACH_EVENT.blotted:
        return spaceSocket(plan, 'choir', `lectern-${nth + 1}`) ?? feet;
      default:
        return seen.gate && WAKING.has(event.kind) ? (this.gate?.at ?? feet) : feet;
    }
  }

  /** The compass's places in the run: the stage reached, the way on to the next encounter while none runs, the way
   *  out (the way in, or the court's portal once the Breach is cleared), and the Lodestone where it lies. */
  private runPlaces(plan: BreachPlan, seen: BreachSeen): PublicShown['places'] {
    const next = plan.encounters[encounterOn(seen)];
    const cleared = !next;
    const stage = STAGES[seen.reached];
    const places = [
      { at: stage ? spaceSocket(plan, stage[0], stage[1]) : null, kind: 'chest' as const },
      {
        at: seen.encounter === 0 && next?.space ? spaceSocket(plan, next.space, 'entry') : null,
        kind: 'event' as const,
      },
      { at: spaceSocket(plan, cleared ? 'court' : 'descent', cleared ? 'portal' : 'entry'), kind: 'breach' as const },
      { at: seen.stone === STONE.lying || seen.stone === STONE.plinth ? seen.stoneAt : null, kind: 'heroic' as const },
    ];
    return places.flatMap(({ at, kind }) => (at ? [{ x: at[0], y: at[1], kind }] : []));
  }

  /** A raising asked: the room's answer to it, once it comes, told in words where it refused. */
  private heedRaising(word: BreachOn): void {
    const gear = word.gear;
    if (this.asked === null || !gear || gear.answered === this.asked) return;
    this.asked = null;
    const words =
      gear.answer === NO_REVIVES
        ? 'No revives are left to raise them.'
        : gear.answer === NONE_TO_RAISE
          ? 'No one fallen is in reach to raise.'
          : null;
    if (words) this.parts.context.trips.tell?.(words);
  }

  /** Each of the gate's moorings: claimed by the Lattice (the room's word), held by a living player of the company
   *  holding the gate standing on it, or free. */
  private moorings(seen: BreachSeen): Mooring[] {
    const bodies = this.living(seen.holders);
    return MOORINGS.map((name, nth) => {
      if ((seen.claims & (1 << nth)) !== 0) return 'claimed';
      const spot = this.gateSocket(name);
      return spot && bodies.some((body) => flat(body, spot) <= MOORING_REACH_M) ? 'held' : 'free';
    });
  }

  /** Where each living player stands, the player among them, of `among` where it is given; the room counts who
   *  lives. */
  private living(among?: readonly number[]): Point[] {
    const word = this.word;
    if (!word) return [];
    const counted = (id: number) => !among || among.includes(id);
    const alive = !!word.fight.own && word.fight.own.action.kind !== 'dead';
    const own: Point[] = alive && counted(word.fight.player) ? [this.feet] : [];
    const others = [...word.fight.others].filter(([id, seen]) => counted(id) && !fallen(seen) && seen.fighter);
    return [...own, ...others.map(([, seen]): Point => [seen.body.x, seen.body.y, seen.body.z])];
  }

  private openToMe(seen: BreachSeen): boolean {
    return !!this.word && seen.openTo.includes(this.word.fight.player);
  }

  /** The run's props: its spaces where its plan stands them, each seal while shut, each slab while it stands, a
   *  crystal at each bell, the Lodestone on its plinth, lying, or over its bearer, turning, and the hidden chests open. */
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
    // Each hidden chest stands shut, as an event's chest does, and open once the room pays it to those beside it.
    HIDDEN_CHESTS.forEach(({ space, socket, open }, nth) => {
      const spot = spaceSocket(plan, space, socket);
      if (spot) props.push(...chestProps({ id: nth, at: spot, tier: 1, opened: open(seen) ? LONG_OPEN_S : null }));
    });
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
      const held = seen.raising.find((raising) => raising.raiser === word.fight.player && raising.raised === raise);
      return {
        words: `Hold to raise ${name}`,
        share: held?.share ?? null,
        run: () => {
          [this.raising, this.asked] = [raise, word.gear?.answered ?? null];
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

  /** A fallen company member within reach of `feet`, the nearest, where the room would let them be raised: none with
   *  no revive left; anyone in the run (it holds only its company); at the gate, one of the company holding it while
   *  its Waking runs, the player among them. */
  private raisable(seen: BreachSeen, feet: Point): number | null {
    const word = this.word;
    if (!word || seen.revives === 0) return null;
    const waking = seen.heldBy && !seen.woken && seen.holders.includes(word.fight.player);
    if (seen.gate && !waking) return null;
    let nearest: { id: number; apart: number } | null = null;
    for (const [id, other] of word.fight.others) {
      if (!fallen(other) || other.standing.kind === 'dead') continue;
      if (seen.gate && !seen.holders.includes(id)) continue;
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
