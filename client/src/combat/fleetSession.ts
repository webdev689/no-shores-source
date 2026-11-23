import { type FleetOrders, type NavalEvent, type SeenVessel, ordersBytes } from '../network/fleetMessages.ts';
import { Prediction } from '../network/prediction.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { FightEvent, ShipState, ShotName } from '../rules/fightRules.ts';
import { feelOf, type NavalEvent as SeaEvent, PARTS, PIECES } from '../rules/feelEvents.ts';
import type { FleetLay, FleetLook, FleetRules, LaySighted } from '../rules/fleetRules.ts';
import type { Helm, Pose, ShipFloats } from '../rules/landRules.ts';

/** The rooms' tick, seconds (crates/sailing TICK_SECONDS). */
const TICK_SECONDS = 1 / 60;
/** The most ticks the page catches up at once, and the most it reckons past the last snapshot (seconds). */
const MOST_OWED_TICKS = 15;
const MOST_AHEAD_S = 0.25;
/** A ball's fall, m/s², as the naval crate's ballistics. */
const GRAVITY = 9.81;
const LOADS: readonly ShotName[] = ['round', 'grape', 'chain', 'heated'];
const ZONES = ['hull', 'holed', 'rig'] as const;
/** The most of the fight's events kept for its feel until taken. */
export const MOST_FELT = 512;
const SIDES = ['port', 'starboard'] as const;
const STATES = ['afloat', 'struck', 'sinking', 'sunk'] as const;
/** A ship whose hurts are not known yet: sound, its canvas whole. */
const SOUND = { sail: 1, maxSail: 0 } as const;
/** The ship numbers the editor's fight words know: the player's 0, a captain's 1, another player's 2. */
const OWN = 0;
const CAPTAIN = 1;
const OTHER = 2;

/** A tick's worth of what the player does at sea in a fleet (the editor's `FleetInput`). */
export interface SessionInput {
  readonly steer: number;
  readonly climbs: readonly number[];
  readonly look: FleetLook | null;
  readonly fire: boolean;
  readonly brace: boolean;
  readonly loadSteps: number;
  readonly call: 'none' | 'captain' | 'send off';
  readonly captain?: { readonly faction: number; readonly rank: number };
}

/**
 * A player's Sloop in a fleet room: put to sea where it lies, its orders sent a tick at a time as the page's clock
 * owes them, and the ship predicted by the room's own rules and corrected by each snapshot. It keeps what the room
 * last showed: every other ship, the balls aloft, and what happened.
 */
export class FleetSession {
  private readonly link: RoomLink;
  private readonly rules: FleetRules;
  private prediction = new Prediction<FleetOrders>();
  /** The link's welcomes followed: one more means they joined the fleet again. */
  private joined: number;
  private start: readonly [number, number, number] | null;
  private ship: ShipFloats;
  private pose: Pose = { heave: 0, pitch: 0, roll: 0, aground: false };
  private owed = 0;
  private fires = 0;
  private loadSteps = 0;
  private climbs: number[] = [];
  private calls: Pick<SessionInput, 'call' | 'captain'>[] = [];
  private lastLook: FleetLook | null = null;
  /** How many orders in a row have held a look on its side (starboard or not), counted as the room counts them
   *  (`Fight::hold_lays`), so the lay shows the spread the room fires at: -1 while none is held. */
  private held = { starboard: true, orders: -1 };
  /** The load they last asked for and the orders that asked, until the room has taken them. */
  private loadAsked: { readonly load: number; readonly sequence: number } | null = null;
  private latest: Snapshot | null = null;
  private receivedAt = 0;
  private shownTime = 0;
  /** Every ship a captain sails that the room has shown: a number is never given twice, so one gone stays known. */
  private readonly captains = new Set<number>();
  private events: FightEvent[] = [];
  private felt: FightEvent[] = [];

  constructor(link: RoomLink, rules: FleetRules, start: readonly [number, number, number]) {
    this.link = link;
    this.rules = rules;
    this.start = start;
    this.joined = link.joins;
    this.ship = new Float64Array([start[0], start[1], start[2], 0, 0, 0, 0, 0]);
  }

  /** Follows the link into the fleet it joined again: a new player there, their ship put to sea where it lies, with
   *  nothing of the old room kept. */
  private follow(): void {
    if (this.link.joins === this.joined) return;
    const [x = 0, y = 0, heading = 0] = this.ship;
    [this.joined, this.prediction, this.start] = [this.link.joins, new Prediction(), this.start ?? [x, y, heading]];
    [this.latest, this.loadAsked, this.shownTime] = [null, null, 0];
    this.captains.clear();
  }

  /** Whether the link is joining the fleet again after its socket closed. */
  get rejoining(): boolean {
    return this.link.rejoining;
  }

  /** Their number in the room: their ship's. */
  get id(): number {
    return this.link.player;
  }

  /** Why the room was lost, or null while it holds. */
  get lost(): string | null {
    return this.link.lost;
  }

  /** Their ship as predicted, and its pose. */
  shipFloats(): ShipFloats {
    return this.ship;
  }

  shipPose(): Pose {
    return this.pose;
  }

  /** The room's clock at `now` (page seconds): its last snapshot's tick, and the time since, a little at most. A late
   *  snapshot's next comes soon after it, so the clock holds still meanwhile rather than run back. */
  roomTime(now: number): number {
    const tick = this.latest ? Number(this.latest.tick) : 0;
    const reckoned = tick * TICK_SECONDS + Math.min(Math.max(0, now - this.receivedAt), MOST_AHEAD_S);
    this.shownTime = Math.max(this.shownTime, reckoned);
    return this.shownTime;
  }

  /** The room's word on their own ship, once it has it at sea. */
  own(): SeenVessel | null {
    return this.latest?.vessels.find((vessel) => vessel.id === this.id) ?? null;
  }

  private hurts(): { readonly sail: number; readonly maxSail: number } {
    const own = this.own();
    if (!own) return SOUND;
    return { sail: own.hurts.sail, maxSail: own.hurts.maxSail };
  }

  /** Every other ship in the room as it last showed them. */
  others(): readonly SeenVessel[] {
    return this.latest?.vessels.filter((vessel) => vessel.id !== this.id) ?? [];
  }

  /** Their ship stepped by one set of orders, by the room's rules. */
  private stepped(ship: ArrayLike<number>, orders: FleetOrders, time: number): ShipFloats {
    const helm: Helm = { steer: orders.steer, climb: orders.climb as Helm['climb'] };
    const epoch = this.link.epoch ?? 0;
    return new Float64Array(this.rules.predict(ship, this.hurts(), time, epoch, [helm])?.ship ?? Array.from(ship));
  }

  private poseAt(ship: ArrayLike<number>, time: number): Pose {
    return this.rules.predict(ship, this.hurts(), time, this.link.epoch ?? 0, [])?.pose ?? this.pose;
  }

  /** A snapshot from the room: their ship set to its word with their orders it has not taken stepped on top, and what
   *  happened kept for the effects and the panel. */
  receive(snapshot: Snapshot, now: number): void {
    this.follow();
    // Its weather is the world's when the room opened: the predictions sail in the same.
    if (snapshot.worldStart !== this.latest?.worldStart) this.rules.setWorldStart(snapshot.worldStart);
    this.latest = snapshot;
    this.receivedAt = now;
    for (const vessel of snapshot.vessels) if (vessel.captain) this.captains.add(vessel.id);
    const own = this.own();
    const time = this.roomTime(now);
    if (own) {
      this.start = null;
      if (this.loadAsked && own.acknowledged >= this.loadAsked.sequence) this.loadAsked = null;
      const ship = this.prediction.corrected<ShipFloats>(
        new Float64Array(own.ship),
        own.acknowledged,
        (state, orders) => this.stepped(state, orders, time),
      );
      [this.ship, this.pose] = [ship, this.poseAt(ship, time)];
    }
    for (const event of snapshot.naval) {
      const said = this.fightEvent(event);
      if (said) this.events.push(said);
    }
    // A session whose feel nobody takes keeps only the latest.
    this.felt = [...this.felt, ...fleetFeel(snapshot.naval)].slice(-MOST_FELT);
  }

  /** Owes the room `seconds` more and sends a tick's orders for each whole tick owed: their rudder as held, their look
   *  while aiming, and the presses (a rung, a release, a load, a call) on the first tick that takes them. */
  advance(seconds: number, input: SessionInput, now: number): void {
    this.follow();
    this.climbs.push(...input.climbs);
    if (input.fire) this.fires++;
    if (input.look) this.lastLook = input.look;
    if (input.call !== 'none') this.calls.push({ call: input.call, captain: input.captain });
    this.loadSteps += input.loadSteps;
    this.owed = Math.min(this.owed + seconds, MOST_OWED_TICKS * TICK_SECONDS);
    const time = this.roomTime(now);
    while (this.owed + 1e-9 >= TICK_SECONDS) {
      this.owed -= TICK_SECONDS;
      const firing = this.fires > 0;
      this.fires = Math.max(0, this.fires - 1);
      const step = Math.sign(this.loadSteps);
      this.loadSteps -= step;
      // A press on top of one the room has not taken yet steps from that one.
      const loaded = this.loadAsked?.load ?? this.own()?.load ?? 1;
      const load = step === 0 ? 0 : ((loaded - 1 + step + LOADS.length) % LOADS.length) + 1;
      const { call, captain } = this.calls.shift() ?? { call: 'none' };
      const orders: FleetOrders = {
        steer: input.steer,
        climb: this.climbs.shift() ?? 0,
        look: input.look ?? (firing ? this.lastLook : null),
        fire: firing,
        brace: input.brace,
        load,
        putToSea: this.start,
        call,
        ...(captain ? { captain } : {}),
      };
      const starboard = (orders.look?.bearing ?? 0) >= 0;
      const kept = orders.look && this.held.orders >= 0 && this.held.starboard === starboard;
      this.held = { starboard, orders: orders.look ? (kept ? this.held.orders + 1 : 0) : -1 };
      const sequence = this.prediction.next(orders);
      if (load !== 0) this.loadAsked = { load, sequence };
      this.link.send(ordersBytes(sequence, orders));
      this.ship = this.stepped(this.ship, orders, time);
    }
    this.pose = this.poseAt(this.ship, time);
  }

  /** The balls aloft at `now`, each where its closed form has it, with its radius. */
  balls(now: number): (readonly [number, number, number, number])[] {
    const snapshot = this.latest;
    if (!snapshot) return [];
    const clock = snapshot.fightClock + this.roomTime(now) - Number(snapshot.tick) * TICK_SECONDS;
    return snapshot.balls
      .map((ball) => ({ ball, flown: clock - ball.born }))
      .filter(({ flown }) => flown >= 0)
      .map(({ ball, flown }) => {
        const [x, y, z] = ball.start;
        const [east, south, up] = ball.launch;
        return [x + east * flown, y + south * flown, z + up * flown - 0.5 * GRAVITY * flown * flown, ball.radius];
      });
  }

  /** Their look's lay among the ships they see, as the room would lay it now. */
  lay(look: FleetLook, now: number): FleetLay | null {
    const load = this.own()?.load ?? 1;
    const sighted = (vessel: SeenVessel): LaySighted => ({
      id: vessel.id,
      flag: vessel.faction,
      ...(vessel.hull === undefined ? {} : { hull: vessel.hull }),
      ship: vessel.ship,
      pose: vessel.pose,
      afloat: vessel.state !== 'sunk',
    });
    const { heave, pitch, roll, aground } = this.pose;
    const own: LaySighted = {
      id: this.id,
      flag: 0,
      ship: this.ship,
      pose: [heave, pitch, roll, aground ? 1 : 0],
      afloat: true,
    };
    // Held as long as the orders sent have held it, the first order none.
    const heldS = Math.max(0, this.held.orders) * TICK_SECONDS;
    return this.rules.lay(own, load, { ...look, heldS }, this.roomTime(now), this.others().map(sighted));
  }

  /** A ship's number as the editor's fight words know it. */
  private known(id: number): number {
    if (id === this.id) return OWN;
    return this.captains.has(id) ? CAPTAIN : OTHER;
  }

  /** An event of the room's fight as the editor's fight shows one; what was another player's own (their guns' refusals,
   *  their sails, their loads) is theirs to see. */
  private fightEvent(event: NavalEvent): FightEvent | null {
    const ship = this.known(event.ship);
    const mine = ship === OWN;
    switch (event.kind) {
      case 'muzzle':
        return { kind: 'muzzle', ship, point: event.point, launch: event.launch };
      case 'hit':
        return { kind: 'hit', ship, by: this.known(event.by), zone: ZONES[event.detail] ?? 'hull', point: event.point };
      case 'splash':
      case 'land':
        return { kind: event.kind, point: event.point };
      case 'state':
        return { kind: 'state', ship, state: (STATES[event.detail] ?? 'afloat') as ShipState };
      case 'refused': {
        const why = (['no-guns', 'silent', 'braced', 'reloading'] as const)[event.detail] ?? 'no-guns';
        return mine ? { kind: 'refused', why, side: SIDES[event.side] ?? 'port', left: event.left } : null;
      }
      case 'no-sail':
        return mine ? { kind: 'no-sail' } : null;
      case 'load':
        return mine ? { kind: 'load', shot: LOADS[event.detail - 1] ?? 'round' } : null;
      case 'run-out':
        return { kind: 'run-out', side: SIDES[event.detail] ?? 'port' };
      case 'ram':
        return { kind: 'ram', ship, by: this.known(event.by), point: event.point, dealt: event.left };
      case 'gone':
        return { kind: 'gone', ship, sunk: event.detail === 0 };
      default:
        return null;
    }
  }

  /** The fight's events since last taken for its feel, each ship by its own number. */
  takeFeel(): FightEvent[] {
    const taken = this.felt;
    this.felt = [];
    return taken;
  }

  /** The events since last taken, for the panel. */
  takeEvents(): FightEvent[] {
    const taken = this.events;
    this.events = [];
    return taken;
  }
}

/** A fleet room's events for the fight's feel, each ship by its own number: a ball's muzzle, hit (where on the ship it
 *  struck and on which part, told just before it), splash, landing and a stem's ram; then the sea's own, through the
 *  feel's one mapping (`feelOf`). */
export function fleetFeel(events: readonly NavalEvent[]): FightEvent[] {
  const felt: FightEvent[] = [];
  let struck: NavalEvent | null = null;
  for (const event of events) {
    const { ship, point } = event;
    const room = ((): SeaEvent | null => {
      const tick = Number(event.tick);
      switch (event.kind) {
        case 'sail-lost':
          return { kind: 'SailLost', tick, ship, sail: event.detail };
        case 'mast-fell':
          return { kind: 'MastFell', tick, ship, mast: event.detail };
        case 'struck':
          return { kind: 'Struck', tick, ship };
        case 'sinking':
          return { kind: 'Sinking', tick, ship };
        case 'flotsam':
          return {
            kind: 'Flotsam',
            tick,
            id: ship,
            at: [point[0], point[1]],
            kind_of: PIECES[event.detail] ?? 'crate',
          };
        case 'gathered':
          return { kind: 'Gathered', tick, id: ship, by: event.by };
        case 'boarding':
          return { kind: 'Boarding', tick, ship };
        default:
          return null;
      }
    })();
    const feel = room && feelOf(room);
    if (feel) felt.push(feel);
    else if (event.kind === 'struck-at') struck = event;
    else if (event.kind === 'muzzle') felt.push({ kind: 'muzzle', ship, point, launch: event.launch });
    else if (event.kind === 'splash' || event.kind === 'land') felt.push({ kind: event.kind, point });
    else if (event.kind === 'ram') felt.push({ kind: 'ram', ship, by: event.by, point, dealt: event.left });
    else if (event.kind === 'hit') {
      const hit = { kind: 'hit', ship, by: event.by, zone: ZONES[event.detail] ?? 'hull', point } as const;
      const along = struck?.ship === ship ? { at: struck.point, part: PARTS[struck.detail] ?? 'hull' } : {};
      struck = null;
      felt.push({ ...hit, ...along });
    }
  }
  return felt;
}
