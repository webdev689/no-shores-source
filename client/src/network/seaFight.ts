// A fight at sea as the sea room sends it and takes its orders: the naval crate's numbers (crates/naval/src/wire.rs),
// read back into the fight's view the World Editor's fight shows, so both show a fight alike.
import {
  type CaptainMode,
  type FightCaptain,
  type FightEnd,
  type FightEvent,
  type FightLay,
  type FightOrders,
  type FightVessel,
  type FightView,
  type Point,
  SHOT_CYCLE,
  type ShipState,
  type ShotName,
  type SideName,
} from '../rules/fightRules.ts';
import { feelOf, type NavalEvent, PARTS, PIECES } from '../rules/feelEvents.ts';

const STATES: readonly ShipState[] = ['afloat', 'struck', 'sinking', 'sunk'];
const MODES: readonly CaptainMode[] = ['cruise', 'engage', 'flee', 'struck', 'sinking'];
const SIDES: readonly SideName[] = ['port', 'starboard'];
const ZONES = ['hull', 'holed', 'rig'] as const;
const WHYS = ['no-guns', 'silent', 'braced', 'reloading'] as const;
const OVER = [null, 'sunk', 'gone'] as const;
const SHIP_NUMBERS = 8;
const POSE_NUMBERS = 4;
/** A look's ray: the aim eye (east, south, up), then the way it looks. */
const RAY_NUMBERS = 6;

/** A fight's orders as the room takes them: the rudder, a tap for a burst, the rung, the look and its ray, the fire,
 *  the brace and a load. */
export function ordersNumbers(orders: FightOrders): number[] {
  const { helm, aim, load } = orders;
  const ray = aim?.ray?.length === RAY_NUMBERS ? aim.ray : null;
  return [
    helm.steer,
    orders.boost ? 1 : 0,
    helm.climb,
    aim ? 1 : 0,
    aim?.bearing ?? 0,
    aim?.range ?? 0,
    ray ? 1 : 0,
    ...(ray ?? Array<number>(RAY_NUMBERS).fill(0)),
    orders.fire ? 1 : 0,
    orders.brace ? 1 : 0,
    load === null ? 0 : SHOT_CYCLE.indexOf(load) + 1,
  ];
}

/** Where a view's other captains sit (after its clock, its end, the player's Sloop, the captain's ship and its mind:
 *  crates/naval/src/wire.rs OTHERS_AT); each ship's numbers end with its hull. */
const OTHERS_AT = 2 + 2 * (SHIP_NUMBERS + POSE_NUMBERS + 17) + 4;

/** A fight's numbers as `fightViewOf` reads them, from a room's view and its other captains, which the room sends apart
 *  so a page that knows one captain reads the view whole: their count and each one's numbers, or none. */
export function withOthers(view: ArrayLike<number>, others: ArrayLike<number> | null): Float64Array {
  const numbers = Array.from(view);
  if (numbers.length <= OTHERS_AT) return new Float64Array(numbers);
  const between = others && others.length > 0 ? Array.from(others) : [0];
  return new Float64Array([...numbers.slice(0, OTHERS_AT), ...between, ...numbers.slice(OTHERS_AT)]);
}

export { type NavalEvent, PARTS, PIECES } from '../rules/feelEvents.ts';

/** A sea fight's view: the World Editor's fight view, and what the sea's fights tell beside it. */
export type SeaFightView = FightView & { naval: NavalEvent[] };

/** One of the sea's own events from its numbers (its kind, 11 to 19, read already), reading on with `next`; none for a
 *  kind that is not one of them. */
export function navalEventOf(kind: number, next: () => number): NavalEvent | null {
  const named = <T>(names: readonly T[]): T => {
    const name = names[next()];
    if (name === undefined) throw new Error('a fight’s number names nothing');
    return name;
  };
  switch (kind) {
    case 11:
      return { kind: 'Splash', tick: next(), at: [next(), next()] };
    case 12:
      return { kind: 'Hit', tick: next(), ship: next(), at: [next(), next(), next()], part: named(PARTS) };
    case 13:
      return { kind: 'SailLost', tick: next(), ship: next(), sail: next() };
    case 14:
      return { kind: 'MastFell', tick: next(), ship: next(), mast: next() };
    case 15:
      return { kind: 'Struck', tick: next(), ship: next() };
    case 16:
      return { kind: 'Sinking', tick: next(), ship: next() };
    case 17:
      return { kind: 'Flotsam', tick: next(), id: next(), at: [next(), next()], kind_of: named(PIECES) };
    case 18:
      return { kind: 'Gathered', tick: next(), id: next(), by: next() };
    case 19:
      return { kind: 'Boarding', tick: next(), ship: next() };
    default:
      return null;
  }
}

/** One of the sea's own events as the fight's feel reads it: `ships/fightFeel.ts`'s, the one mapping. */
export { feelOf };

/** Who a fight's captain is: its name, its faction and its rank. */
export type Commissioned = Pick<FightCaptain, 'name' | 'faction' | 'rank'>;

/** The first captain's number in a fight (crates/naval CAPTAIN); every other carries its own on the wire. */
const CAPTAIN_SHIP = 1;
/** A captain the room has not named: a Major of the Grey Tithe. */
const TITHE_MAJOR: Commissioned = { name: 'Tithe Sloop', faction: 1, rank: 2 };

/** The fight a sea room's numbers show, its captain `who` (a Major of the Grey Tithe unless told) and each other captain
 *  named by its faction (`nameOf`); throws where the numbers run short or name nothing. */
export function fightViewOf(
  numbers: ArrayLike<number>,
  who: Commissioned = TITHE_MAJOR,
  nameOf: (faction: number, hull: number) => string = () => 'Sloop',
): SeaFightView {
  let read = 0;
  const next = (): number => {
    if (read >= numbers.length) throw new Error('a fight’s numbers run short');
    return numbers[read++] ?? 0;
  };
  const many = (count: number): number[] => Array.from({ length: count }, next);
  const named = <T>(names: readonly T[]): T => {
    const name = names[next()];
    if (name === undefined) throw new Error('a fight’s number names nothing');
    return name;
  };
  const point = (): Point => [next(), next(), next()];
  const vessel = (): FightVessel => ({
    ship: many(SHIP_NUMBERS),
    pose: many(POSE_NUMBERS),
    hull: next(),
    max_hull: next(),
    sail: next(),
    max_sail: next(),
    crew: next(),
    max_crew: next(),
    state: named(STATES),
    fires: next(),
    guns: {
      left: [next(), next()],
      progress: [next(), next()],
      load: named<ShotName>(SHOT_CYCLE),
      braced: next() === 1,
    },
    boost: [next(), next()],
    hull_kind: next(),
  });
  // A captain's Sloop, then its mode, whether it is hostile to the player (not of their side), and its sides run out.
  const commanded = (id: number, commission: Commissioned): FightCaptain => {
    const base = vessel();
    const mode = named(MODES);
    const hostile = next() === 1;
    return { ...base, id, ...commission, mode, hostile, run_out: SIDES.filter(() => next() === 1) };
  };
  const clock = next();
  const over = named(OVER);
  const player = vessel();
  const captain = commanded(CAPTAIN_SHIP, who);
  const others = Array.from({ length: next() }, () => {
    const [id, faction, rank] = [next(), next(), next()];
    const other = commanded(id, { name: '', faction, rank });
    return { ...other, name: nameOf(faction, other.hull_kind ?? 0) };
  });
  const balls = Array.from({ length: next() }, () => [next(), next(), next(), next()] as const);
  // Where a gun's ball stops: whether it does, its time and point, whether in the water, and where it strikes the ship.
  const stop = (): FightEnd | null => {
    const [stops, time, where, water, struck, strike] = [next() === 1, next(), point(), next() === 1, next(), point()];
    return stops ? { time, point: where, water, strike: struck === 1 ? strike : null } : null;
  };
  let lay: FightLay | null = null;
  if (next() === 1) {
    const [side, elevation, reach, radius] = [named(SIDES), next(), next(), next()];
    const onTarget = next() === 1;
    const guns = Array.from({ length: next() }, () => ({ launch: many(6), end: stop() }));
    const [launches, ends] = [guns.map((gun) => gun.launch), guns.map((gun) => gun.end)];
    lay = { side, elevation, reach, ends, radius, on_target: onTarget, launches };
  }
  const naval: NavalEvent[] = [];
  // The hit the room tells just before its ball's, where on the ship it struck and on which part, for that ball's hit.
  let struck: Extract<NavalEvent, { kind: 'Hit' }> | null = null;
  const told = Array.from({ length: next() }, (): FightEvent | null => {
    const kind = next();
    if (kind > 10) {
      const event = navalEventOf(kind, next);
      if (!event) throw new Error('a fight’s event is of no kind');
      naval.push(event);
      if (event.kind === 'Hit') struck = event;
      return feelOf(event);
    }
    switch (kind) {
      case 1:
        return { kind: 'muzzle', ship: next(), point: point(), launch: point() };
      case 2: {
        const hit = { kind: 'hit', ship: next(), by: next(), zone: named(ZONES), point: point() } as const;
        const along = struck?.ship === hit.ship ? { at: struck.at, part: struck.part } : {};
        struck = null;
        return { ...hit, ...along };
      }
      case 3:
        return { kind: 'splash', point: point() };
      case 4:
        return { kind: 'land', point: point() };
      case 5:
        return { kind: 'run-out', side: named(SIDES) };
      case 6:
        return { kind: 'state', ship: next(), state: named(STATES) };
      case 7: {
        const [why, side, left] = [named(WHYS), named(SIDES), next()];
        return why === 'reloading' ? { kind: 'refused', why, side, left } : { kind: 'refused', why };
      }
      case 8:
        // Its one number is always 0.
        next();
        return { kind: 'no-sail' };
      case 9:
        return { kind: 'load', shot: named(SHOT_CYCLE) };
      case 10:
        return { kind: 'ram', ship: next(), by: next(), point: point(), dealt: next() };
      default:
        throw new Error('a fight’s event is of no kind');
    }
  });
  if (read !== numbers.length) throw new Error('a fight’s numbers run on past its view');
  const events = told.filter((event): event is FightEvent => event !== null);
  return { clock, player, captain, others, balls, lay, events, over, fingerprint: '', naval };
}
