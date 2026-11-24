// What the music hears of the game: on foot, the fight the frame showed (the player's own fighter, every foe marked
// with its rank, alert and health, and the blows since the last frame); at sea, the sea room's hostile ships and the
// fight it began, the coast it may land on and the sky over it. Pure readings of what the game already has, for the
// director's law.

import { EVENT } from '../../../combat/cues.ts';
import type { MarkedFoe } from '../../../combat/foePlate.ts';
import type { FightEvent, SeenHostile } from '../../../network/messages.ts';
import type { FightCaptain, FightVessel } from '../../../rules/fightRules.ts';
import type { FighterView } from '../../../rules/fighters.ts';
import type { SkyReading } from '../../../sky/skyLaw.ts';
import type { Landfall } from '../../seaLaw.ts';
import { type Place, placeOf } from '../place.ts';
import type { HeardFoe, HeardSky, Hearing, Mood } from './directorLaw.ts';

/** The fight a frame on foot showed, as far as the music reads it. */
export interface FootHeard {
  readonly player: number;
  readonly own: FighterView | null;
  readonly events: readonly FightEvent[];
  readonly foes: readonly MarkedFoe[];
  /** The zone's public event as shown: the least mood it holds the player to, on its ground while it runs. */
  readonly public?: { readonly mood?: Mood | null; readonly part?: number } | null;
}

/** The sea, as far as the music reads it: where the ship lies, the hostile ships round it, its fight, and the
 *  landfall it is offered off a coast. */
export interface SeaHeard {
  readonly position: readonly [number, number];
  readonly landfall?: Landfall;
  readonly sighted: { readonly hostiles: readonly SeenHostile[] } | null;
  readonly fight: { readonly captains: readonly FightCaptain[]; readonly vessel: FightVessel } | null;
}

/** A foe alert, with a target. */
const ALERT = 2;
/** A hostile ship this near is closing on the player, metres: the edge of the ring the sea sends one out on. */
export const SEA_NEAR_M = 1000;

/** The music's hearing on foot in `node` of `world`, from the fight a frame showed. */
export const hearNode = (world: Parameters<typeof placeOf>[0], node: Parameters<typeof placeOf>[1], fight: FootHeard) =>
  hearFoot(placeOf(world, node), fight);

/** The music's hearing on foot, from the fight a frame showed. */
export function hearFoot(place: Place, fight: FootHeard): Hearing {
  const { own, player, events } = fight;
  const struck = new Set<number>();
  let kills = 0;
  for (const event of events) {
    // A player standing again, revived or drinking, or the run's word on its checkpoints, is no fight.
    const calm: readonly number[] = [EVENT.respawned, EVENT.revived, EVENT.healed, EVENT.checkpoint, EVENT.fellBack];
    if (calm.includes(event.kind)) continue;
    if (event.striker === player) struck.add(event.defender);
    if (event.defender === player) struck.add(event.striker);
    if (event.kind === EVENT.killed && event.striker === player) kills++;
  }
  const here = own ? ([own.x, own.y] as const) : null;
  // An ally on the players' side (the Brig's crew on the wreck) fights alert by them: no danger to them.
  const foes = fight.foes
    .filter((foe) => foe.view.side !== 'players')
    .map((foe): HeardFoe => ({
      id: foe.id,
      name: foe.name,
      rank: foe.rank,
      alert: foe.alert,
      distance: here ? Math.hypot(foe.view.x - here[0], foe.view.y - here[1]) : Infinity,
      health: foe.view.healthMax > 0 ? foe.view.health / foe.view.healthMax : 1,
      engaged: struck.has(foe.id) || (foe.alert === ALERT && foe.view.target === player),
    }));
  return {
    place,
    dead: own?.action.kind === 'dead',
    health: own && own.healthMax > 0 ? own.health / own.healthMax : 1,
    struck: struck.size > 0,
    kills,
    foes,
    sea: null,
    sky: null,
    ...(fight.public?.mood && { least: fight.public.mood }),
    ...(fight.public?.part && { part: fight.public.part }),
  };
}

/** The sky as the music hears it, from a reading; none before the sky has come. */
export const heardSky = (reading: SkyReading | null): HeardSky | null =>
  reading && {
    falling: reading.falling,
    storm: reading.storm,
    fog: reading.fog,
    windMS: Math.hypot(reading.wind[0], reading.wind[1]),
    night: reading.daylight <= 0,
  };

/** The music's hearing at sea, from the ship's sea: the fight on screen, the hostile ships round it, the coast it
 *  may land on, and the sky. */
export function hearSea(sea: SeaHeard, sky: HeardSky | null = null): Hearing {
  const [x, y] = sea.position;
  const near = (sea.sighted?.hostiles ?? []).filter((ship) => Math.hypot(ship.x - x, ship.y - y) <= SEA_NEAR_M);
  const fight = sea.fight;
  const captains = (fight?.captains ?? []).filter((captain) => captain.hostile && captain.state === 'afloat');
  const vessel = fight?.vessel ?? null;
  return {
    place: { kind: 'sea' },
    dead: false,
    health: 1,
    struck: false,
    kills: 0,
    foes: [],
    sea: {
      fighting: captains.length > 0,
      captains: captains.length,
      strongest: Math.max(0, ...captains.map((captain) => captain.rank), ...near.map((ship) => ship.rank)),
      hull: vessel && vessel.max_hull > 0 ? vessel.hull / vessel.max_hull : 1,
      hostilesNear: near.length,
      landfall: !!sea.landfall,
    },
    sky,
  };
}
