// A Breach as the page plays it, a frame at a time, from what its room says of it (`BreachSeen`): in its gate's patrol
// zone, the gate's banner for everyone there (or its line beside a public event's), the Spire's glow as it fills, the
// gate's mark on the compass, and E at the gate once it is open to the player's company; in its run, its spaces, its
// seals while shut, the Broken Stair's slabs while they stand, its bells, the Lodestone and the hidden chests as props,
// the encounter's banner and marks (`breachMarks.ts`), the compass's places, and E at the way out. In both, a ring
// under each Rewritten player, whom the game's revive may stand (`footRevive.ts`) and how the fallen stand again, and
// the room's moments heard and told (`breachMoments.ts`), and what the ambience hears of it (`BREACH_HEARD`). The room
// judges it all.
import type { EventProp, PropModule } from '../city/eventProps.ts';
import { PROP_MODULES, chestProps } from '../city/eventProps.ts';
import { loadSealModule, moduleNumber } from '../city/modules.ts';
import { markLine } from '../combat/drops.ts';
import type { Banner, PublicShown } from '../combat/publicBanner.ts';
import { markRing } from '../combat/marks.ts';
import { BREACH_EVENT, BREACH_PHASE, type BreachSeen, STONE } from '../network/breachMessages.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import type { FightEvent, SeenPlayer } from '../network/messages.ts';
import type { PlayerPlate } from '../network/plateMessages.ts';
import { fighterView } from '../rules/fighters.ts';
import type { NodeLayout } from '../layout/layouts.ts';
import { BREACH_HEARD } from './audio/ambience/breachHeard.ts';
import { RunCounting } from './breachCounts.ts';
import { type MarkedFoe, dashedRing, mooringMark, runMarks } from './breachMarks.ts';
import type { HeardSound } from '../combat/worldSounds.ts';
import { MomentWords, STATE_CUES, beatOf, heardOf, momentSounds, momentsHad } from './breachMoments.ts';
import { mooringSounds, slabSounds, stingOf } from './breachMoments.ts';
import { type BreachPlan, breachPlanOf, sealOpen, slabStands, socketAt, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER, type Mooring, breachCall, encounterName, encounterOn } from './breachWords.ts';
import { gateBanner, gateLine, inSentence, runBanner, teachingWords, wonWords } from './breachWords.ts';
import type { Use } from './footGear.ts';
import type { StandingAgain } from './footRevive.ts';
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
 *  zone's layout, for where its gate stands), the ways in and out, the room's module (the plan), and the way the
 *  gate's seal's mesh is fetched (`loadSealModule` unless given). */
export interface BreachParts {
  readonly zone: NodeInfo;
  readonly run: InBreach | null;
  readonly context: {
    readonly land: { layoutsNamed(ids: readonly string[]): Promise<string> };
    readonly trips: { enterBreach?(): void; leaveBreach?(): void; tell?(words: string): void };
  };
  readonly module: WebAssembly.Module;
  readonly seal?: () => unknown;
}

/** What a frame reads of the room: its word on the Breach, the fight (the player's number and their own fighter, the
 *  room's tick the slabs stand by, every other player and foe with its type, the way to ask), and the other players'
 *  plates (their names). */
export interface BreachOn {
  readonly seen: BreachSeen | null;
  readonly fight: {
    readonly player: number;
    readonly own: { readonly action: { readonly kind: string } } | null;
    readonly roomTick: number;
    readonly others: ReadonlyMap<number, SeenPlayer>;
    readonly foes: ReadonlyMap<number, { readonly view: MarkedFoe; readonly type?: number }>;
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
  readonly sounds: readonly HeardSound[];
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
/** The Spire at the gate's middle (tools/modules/breach_gate.py): its foot over the gate's, how tall it stands, and
 *  its glow, the Lattice's red, rising and brightening as it fills. */
const SPIRE = { footM: 1.2, tallM: 16, colour: [1, 0.28, 0.36] as const, least: 0.25 } as const;
/** How long the fallen lie before standing again of themselves, ticks (fallen.rs): outside a running encounter, and
 *  inside one at Normal. */
const STANDS_OUTSIDE = 6 * 60;
const STANDS_INSIDE = 10 * 60;
/** How near E takes up the Lodestone (lodestone.rs TAKE_REACH_M) and leaves by the way out. */
const TAKE_REACH_M = 2.5;
const OUT_REACH_M = 2.5;
/** How high over its bearer's feet the Lodestone is drawn, metres, and how fast it turns there, radians a second. */
const BORNE_M = 2.3;
const BORNE_TURN = 1.2;
/** The Rewritten's ring: a pale violet, in dashes as it warns, and its sizes, metres. */
const REWRITTEN = { colour: [0.72, 0.55, 1, 0.55] as const, inner: 0.55, outer: 0.7 };
/** How long an encounter's line stands in its banner as it begins, and its won line once it is won, ticks. */
const TEACHING_TICKS = 8 * 60;
const WON_TICKS = 6 * 60;
/** The stages the fallen stand again at, by `reached` (mod.rs STAGES), and the hidden chests by their sockets, each
 *  open to pay as the room says (mod.rs keep_chests): the Descent's and the Stair's always, the page's once the Choir
 *  is won with its bit in `chests`, the heart's with its own. */
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
/** A hidden chest's glow while it is not yet open to pay (one waiting for the player glows as an event's chest). */
const CHEST_GLOW = { shut: 0.25 } as const;
/** The way out once the Breach is cleared, the court's portal, ringed as a dungeon's lit portal shows the way. */
const PORTAL = { colour: [0.72, 0.55, 1, 0.7] as const, inner: 2.2, outer: 2.5 };

const flat = (from: Point, to: Point) => Math.hypot(from[0] - to[0], from[1] - to[1]);
const chestBit = (seen: BreachSeen, bit: number) => (seen.chests & (1 << bit)) !== 0;
const quarter = Math.PI / 2;
const asProp = (name: string): PropModule | null =>
  (PROP_MODULES as readonly string[]).includes(name) ? (name as PropModule) : null;
const prop = (module: PropModule, where: Point, turn: number, rise = 1): EventProp => ({
  ...{ module, at: where, turn, scale: 1, rise, lid: 0, glow: 1 },
});
/** `make`'s answer, worked out only once it is first asked for. */
const once = <Value>(make: () => Value): (() => Value) => {
  let made: { value: Value } | null = null;
  return () => (made ??= { value: make() }).value;
};

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
  private word: BreachOn | null = null;
  private feet: Point = [0, 0, 0];
  /** The gate's holders as the last frame had them (the snapshot the Waking is lost in holds none), and how many of
   *  them lived; the room's word the frame before this one. */
  private holders: readonly number[] = [];
  private holdersLiving = 0;
  private before: BreachSeen | null = null;
  /** The room's tick and the gate's moorings as the last frame had them, for what changed since to be heard. */
  private tick: number | null = null;
  private moored: Mooring[] | null = null;
  /** What the page counts of the run, the moments it tells, and the encounter last begun or won with the room's tick
   *  its line stands in the banner until. */
  private readonly counting: RunCounting | null;
  private readonly told = new MomentWords();
  private lately: { readonly won: boolean; readonly encounter: number; readonly until: number } | null = null;

  constructor(parts: BreachParts) {
    this.parts = parts;
    const plan = parts.run?.plan ?? planOf(parts.module);
    // Only the run, or the patrol zone its gate stands in, shows the Breach.
    this.plan = parts.run || plan?.zone === parts.zone.id ? plan : null;
    this.counting = this.plan && new RunCounting(this.plan);
    if (this.plan && !parts.run) {
      // The gate's doorway stands sealed in this zone alone, so its seal's mesh is fetched only here (and for the run).
      (parts.seal ?? loadSealModule)();
      void parts.context.land.layoutsNamed([parts.zone.id]).then(
        (text) => (this.gate = (JSON.parse(text) as NodeLayout[]).map(gateOf).find(Boolean) ?? null),
        () => undefined,
      );
    }
  }

  /** A gate socket's place in the world, once the zone's layout has said where the gate stands. */
  private gateSocket(name: string): Point | null {
    const gate = this.gate;
    return gate && socketAt('breach-gate', name, gate.at, gate.turn);
  }

  /** One frame at `clock` (the page's seconds): the room's word and `events` since the last, the player at `feet`
   *  seen from `eye`, each fighter where it is drawn (`where`), the rings laid into `marks`. None outside a Breach. */
  frame(
    word: BreachOn,
    events: readonly FightEvent[],
    feet: Point,
    where: (id: number) => Point | null,
    clock: number,
    marks: number[],
    eye: Point = feet,
  ): BreachFrame | null {
    [this.word, this.feet] = [word, feet];
    const { plan, counting } = this;
    if (plan && this.parts.run) BREACH_HEARD.current = { run: plan };
    const seen = word.seen;
    if (!plan || !counting || !seen) return null;
    const before = this.before;
    this.before = seen;
    const own = word.fight.player;
    const tick = word.fight.roomTick;
    const nameOf = (player: number) => (player === own ? 'you' : (word.others.plateOf(player)?.name ?? 'a companion'));
    for (const marked of seen.marked) {
      const spot = marked.player === own ? feet : where(marked.player);
      if (spot) dashedRing(marks, spot, REWRITTEN.inner, REWRITTEN.outer, REWRITTEN.colour);
    }
    // At the gate the Waking's moments are its company's, and theirs who stand in its hollow.
    const company = seen.gate ? [...new Set([...seen.holders, ...this.holders])] : [own, ...word.fight.others.keys()];
    this.holders = seen.holders;
    const inHollow = !!this.gate && flat(feet, this.gate.at) <= HOLLOW_M;
    const had = momentsHad(events, own, !seen.gate || company.includes(own) || inHollow);
    const gate = this.gate;
    const places = {
      own,
      feet,
      where,
      gate: gate?.at ?? null,
      mooring: (nth: number) => this.gateSocket(MOORINGS[nth] ?? ''),
      chest: (nth: number) => {
        const chest = HIDDEN_CHESTS[nth];
        return chest ? spaceSocket(plan, chest.space, chest.socket) : null;
      },
    };
    const slabs = seen.gate ? [] : slabSounds(plan, this.tick, tick);
    this.tick = tick;
    const sounds = [...momentSounds(plan, seen, had, places), ...slabs];
    // A Waking lost while some of its company still lived was lost to its Spire left empty.
    const lost = seen.gate && this.holdersLiving > 0 ? 'the Spire stood empty a whole minute' : null;
    const ours = { ours: company.includes(own), nameOf, lost };
    for (const words of this.told.words(plan, { seen, before, had }, ours)) this.parts.context.trips.tell?.(words);
    const lately = this.latelyIn(had, tick);
    const [sting, beat] = [stingOf(had), beatOf(had)];
    const living = once(() => this.living());
    const alive = !!word.fight.own && word.fight.own.action.kind !== 'dead';
    const counts = counting.frame({ seen, before, events: had, tick, own, feet, alive, living });
    const call = breachCall(seen, counts);
    const heard = { sounds, sting, beat, call };
    const here = { own, nameOf, feet, inHollow, lately, clock, eye, marks, before };
    if (seen.gate) return this.gateFrame(plan, seen, here, heard);
    runMarks(plan, seen, marks, { feet, living, foes: () => [...word.fight.foes.values()], counts });
    const portal = seen.phases.length > 0 && seen.phases.every((phase) => phase === BREACH_PHASE.won);
    const way = portal ? spaceSocket(plan, 'court', 'portal') : null;
    if (way) markRing(marks, way, PORTAL.inner, PORTAL.outer, PORTAL.colour);
    const banner = lateBanner(plan, runBanner(plan, seen, nameOf, counts), seen, lately);
    // A great foe awake (the Scrivener, the Steward) is the music's peak, as an Elite Dungeon's Boss is.
    const great = seen.boss > 0 && (seen.encounter === ENCOUNTER.choir || seen.encounter === ENCOUNTER.steward);
    const mood = great ? ('peak' as const) : seen.encounter > 0 ? ('tension' as const) : null;
    const shown: PublicShown = { banner, beat, places: this.runPlaces(plan, seen), stores: [], call, mood };
    return { shown, line: '', first: true, props: this.runProps(plan, seen, word, where, clock), sounds, sting };
  }

  /** A frame at the gate in the zone: its moorings' rings while the Waking runs and the Spire glowing as it fills, the
   *  seal in its doorway but to the company it opened to, its banner (the player's own company named as theirs, its
   *  line as it begins), its mark on the compass, and the music's tension for its company in the hollow. */
  private gateFrame(
    plan: BreachPlan,
    seen: BreachSeen,
    here: {
      own: number;
      nameOf: (player: number) => string;
      feet: Point;
      inHollow: boolean;
      lately: { readonly won: boolean } | null;
      clock: number;
      eye: Point;
      marks: number[];
      before: BreachSeen | null;
    },
    heard: Pick<BreachFrame, 'sounds' | 'sting'> & Pick<PublicShown, 'beat' | 'call'>,
  ): BreachFrame {
    const { gate } = this;
    const { marks } = here;
    const compass = gate ? [{ x: gate.at[0], y: gate.at[1], kind: 'breach' as const }] : [];
    const moorings = this.moorings(seen);
    const waking = seen.heldBy && !seen.woken;
    moorings.forEach((state, nth) => {
      const spot = this.gateSocket(MOORINGS[nth] ?? '');
      if (spot && !seen.woken) mooringMark(marks, spot, state);
    });
    // The Spire glows as it fills, for everyone in the zone to see.
    if (gate && waking) {
      const foot = [gate.at[0], gate.at[1], gate.at[2] + SPIRE.footM] as const;
      const tall = SPIRE.tallM * Math.max(SPIRE.least, seen.fill);
      markLine(marks, foot, tall, SPIRE.colour, SPIRE.least + seen.fill, here.clock, here.eye);
    }
    const door = this.gateSocket('gate');
    const props = door && gate && !this.openToMe(seen) ? [prop('breach-seal', door, gate.turn * quarter)] : [];
    const spire = gate && ([gate.at[0], gate.at[1], gate.at[2] + SPIRE.footM + SPIRE.tallM / 2] as const);
    const mine = seen.holders.includes(here.own);
    // The ambience hears the gate's hollow, and the Spire's hum as it fills while the player's company holds it.
    if (gate && spire) BREACH_HEARD.current = { gate: gate.at, spire, hum: mine && waking ? seen.fill : 0 };
    // A mooring is heard held only while the Waking runs: its holders stay a while after, as they walk to the door.
    const moored = waking ? mooringSounds(this.moored, moorings, (nth) => this.gateSocket(MOORINGS[nth] ?? '')) : [];
    // Outside the Waking every mooring stands free, so one held as it begins is heard; one held as the page joins it
    // (no frame before) is not.
    this.moored = waking ? moorings : moorings.map((): Mooring => 'free');
    // The Spire is heard on its waking, by its own company: not as a player coming back is counted in again.
    const opened = mine && here.before && !here.before.woken && seen.woken;
    const woken = opened && spire ? heardOf({ cue: STATE_CUES.woken, until: null }, spire) : null;
    const sounds = [...heard.sounds, ...moored, ...(woken ? [woken] : [])];
    const first = seen.holders[0];
    const holding = first === undefined ? '' : mine ? 'Your company' : here.nameOf(first);
    const banner = gateBanner(plan, seen, gate?.place ?? '', moorings, this.openToMe(seen), holding);
    const teaching = mine && waking && here.lately && !here.lately.won ? teachingWords(ENCOUNTER.waking) : '';
    const near = !!gate && flat(here.feet, gate.at) <= GATE_NEAR_M;
    const mood = mine && waking && here.inHollow ? ('tension' as const) : null;
    const shown: PublicShown = {
      banner: teaching ? { ...banner, objective: teaching } : banner,
      beat: heard.beat,
      places: compass,
      stores: [],
      call: heard.call ?? null,
      mood,
    };
    return { shown, line: gateLine(plan, seen), first: near, props, sounds, sting: heard.sting };
  }

  /** The encounter last begun or won by `had`, while its line stands in the banner at the room's `tick`; null after. */
  private latelyIn(
    had: readonly FightEvent[],
    tick: number,
  ): { readonly won: boolean; readonly encounter: number } | null {
    for (const event of had) {
      const won = event.kind === BREACH_EVENT.won;
      if (won || event.kind === BREACH_EVENT.begun)
        this.lately = { won, encounter: Math.round(event.amount), until: tick + (won ? WON_TICKS : TEACHING_TICKS) };
    }
    return this.lately && tick < this.lately.until ? this.lately : null;
  }

  /** How the player stands again if they fall where they stand now (`breachFall`); null outside a Breach. */
  fall(): StandingAgain | null {
    const seen = this.word?.seen;
    if (!this.plan || !this.word || !seen) return null;
    return breachFall(seen, this.word.fight.player, this.feet, this.gate?.at ?? null);
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

  /** Each of the gate's moorings: claimed by the Lattice (the room's word), held by a living player of the company
   *  holding the gate standing on it, or free. */
  private moorings(seen: BreachSeen): Mooring[] {
    const bodies = this.living(seen.holders);
    this.holdersLiving = bodies.length;
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
   *  crystal at each bell, the Lodestone on its plinth, lying, or over its bearer, turning, and the hidden chests,
   *  shut (glowing while open to pay) until the room pays the player, their lids then thrown back. */
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
    HIDDEN_CHESTS.forEach(({ space, socket, open }, nth) => {
      const spot = spaceSocket(plan, space, socket);
      if (!spot) return;
      const opened = this.counting?.chestOpened(nth, tick) ?? null;
      const chest = chestProps({ id: nth, at: spot, tier: 1, opened });
      // One not yet open to pay glows less than one waiting for the player.
      const dim = opened === null && !open(seen);
      props.push(...(dim ? chest.map((part) => ({ ...part, glow: CHEST_GLOW.shut })) : chest));
    });
    return props;
  }

  /** What E does at the player's feet in a Breach before a fallen ally's revive: takes up the Lodestone while it lies
   *  counting down to the company's unwriting; null otherwise. */
  urgent(feet: Point, ask: (asked: GearAsk) => void): Use | null {
    const seen = this.plan ? this.word?.seen : null;
    return seen && seen.lyingTicks > 0 && this.takes(seen, feet) ? this.take(ask) : null;
  }

  private takes(seen: BreachSeen, feet: Point): boolean {
    const lies = seen.stone === STONE.plinth || seen.stone === STONE.lying;
    return lies && flat(feet, seen.stoneAt) <= TAKE_REACH_M && Math.abs(feet[2] - seen.stoneAt[2]) <= 2;
  }

  private take(ask: (asked: GearAsk) => void): Use {
    return { words: 'Take up the Lodestone', run: () => ask({ kind: ASKS.takeLodestone }) };
  }

  /** What E does at the player's feet in a Breach once no fallen ally is revived there: sets down or takes up the
   *  Lodestone; enters the run at the gate once it is open to the player's company, or leaves the run by the way in,
   *  or by the court's portal once the Breach is cleared. */
  use(feet: Point, ask: (asked: GearAsk) => void): Use | null {
    const [plan, word] = [this.plan, this.word];
    const seen = word?.seen;
    if (!plan || !word || !seen) return null;
    if (seen.stone === STONE.borne && seen.bearer === word.fight.player)
      return { words: 'Set down the Lodestone', run: () => ask({ kind: ASKS.dropLodestone }) };
    if (this.takes(seen, feet)) return this.take(ask);
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

  /** Whether the player may revive the fallen player `fallen` as the room's Breach would let them (fallen.rs
   *  `breach_lets_revive`): none once the attempt's revives are spent; at the gate, the company holding it while its
   *  Waking runs revived only by its own. Anyone, outside a Breach. */
  readonly mayRevive = (fallen: number): boolean => {
    const [seen, word] = [this.plan ? this.word?.seen : null, this.word];
    if (!seen || !word) return true;
    const fighting = (id: number) => seen.gate && seen.heldBy && !seen.woken && seen.holders.includes(id);
    if (seen.gate && !fighting(fallen)) return true;
    return seen.revives !== 0 && (!seen.gate || fighting(word.fight.player));
  };
}

/** The run's banner while an encounter's line stands (`lately`): its teaching as it begins, in the objective while it
 *  runs; its won line once won, in the won tone, under its own name. As it is otherwise. */
function lateBanner(
  plan: BreachPlan,
  banner: Banner,
  seen: BreachSeen,
  lately: { readonly won: boolean; readonly encounter: number } | null,
): Banner {
  if (!lately) return banner;
  if (lately.won)
    return {
      ...banner,
      tone: 'won',
      title: encounterName(plan, lately.encounter),
      objective: wonWords(lately.encounter),
    };
  return seen.encounter === lately.encounter ? { ...banner, objective: teachingWords(lately.encounter) } : banner;
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
