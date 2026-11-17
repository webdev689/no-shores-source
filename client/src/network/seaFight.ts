// A fight at sea as the sea room sends it and takes its orders: the naval crate's numbers (crates/naval/src/wire.rs),
// read back into the fight's view the World Editor's fight shows, so both show a fight alike.
import {
  type CaptainMode,
  type FightCaptain,
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

const STATES: readonly ShipState[] = ['afloat', 'struck', 'sinking', 'sunk', 'wrecked'];
const MODES: readonly CaptainMode[] = ['cruise', 'engage', 'flee', 'struck', 'sinking'];
const SIDES: readonly SideName[] = ['port', 'starboard'];
const ZONES = ['hull', 'holed', 'rig'] as const;
const WHYS = ['no-guns', 'silent', 'braced', 'reloading'] as const;
const OVER = [null, 'sunk', 'gone'] as const;
const SHIP_NUMBERS = 8;
const POSE_NUMBERS = 4;

/** A fight's orders as the room takes them: the helm, the look, the fire, the brace and a load. */
export function ordersNumbers(orders: FightOrders): number[] {
  const { helm, aim, load } = orders;
  return [
    helm.steer,
    helm.crab ? 1 : 0,
    helm.climb,
    aim ? 1 : 0,
    aim?.bearing ?? 0,
    aim?.range ?? 0,
    orders.fire ? 1 : 0,
    orders.brace ? 1 : 0,
    load === null ? 0 : SHOT_CYCLE.indexOf(load) + 1,
  ];
}

/** The fight a sea room's numbers show; throws where the numbers run short or name nothing. */
export function fightViewOf(numbers: ArrayLike<number>): FightView {
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
  });
  const clock = next();
  const over = named(OVER);
  const player = vessel();
  const her = vessel();
  const mode = named(MODES);
  const hostile = next() === 1;
  const runOut = SIDES.filter(() => next() === 1);
  const captain: FightCaptain = { ...her, name: 'Pirate Sloop', mode, hostile, run_out: runOut };
  const balls = Array.from({ length: next() }, () => [next(), next(), next(), next()] as const);
  let lay: FightLay | null = null;
  if (next() === 1) {
    const [side, elevation, reach] = [named(SIDES), next(), next()];
    const onTarget = next() === 1;
    lay = { side, elevation, reach, on_target: onTarget, launches: Array.from({ length: next() }, () => many(6)) };
  }
  const events = Array.from({ length: next() }, (): FightEvent => {
    switch (next()) {
      case 1:
        return { kind: 'muzzle', ship: next(), point: point(), launch: point() };
      case 2:
        return { kind: 'hit', ship: next(), by: next(), zone: named(ZONES), point: point() };
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
        return { kind: 'no-sail', wrecked: next() === 1 };
      case 9:
        return { kind: 'load', shot: named(SHOT_CYCLE) };
      default:
        throw new Error('a fight’s event is of no kind');
    }
  });
  if (read !== numbers.length) throw new Error('a fight’s numbers run on past its view');
  return { clock, player, captain, balls, lay, events, over, fingerprint: '' };
}
