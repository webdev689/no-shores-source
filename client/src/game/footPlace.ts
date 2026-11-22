// Where a player stands on foot and the room they join there: the node's ground, its file for a room playing alone, and
// what the page hears of the room. The fight's rules on the room's module are made in `footRoom.ts`.
import type { Cache } from './dungeonChest.ts';
import type { Entrances, Trips } from './footTrips.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { FoeAsk } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { Cards } from '../player/cards.ts';
import { newPlayer } from '../player/player.ts';
import type { Walker } from '../player/walker.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import type { LandWorker } from '../terrain/landClient.ts';
import type { InDungeon } from './footTrips.ts';
import type { Speak } from './footGear.ts';
import type { UsePrompt } from './usePrompt.ts';

/** What a node on foot needs of the game: the movement rules, the land's worker, the player, the forge's cards, the
 *  rooms (null offline), the room's compiled module, the ground as drawn (to hold the camera over it), the foes to
 *  ask a room playing alone for (none but under `npm run dev`), the session's token the rooms keep the player's
 *  character by (null for none), read as each room connects, and the ways into a patrol's dungeons and out. */
export interface FootContext {
  readonly movement: MovementRules;
  readonly land: LandWorker;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly rooms: ((name: string) => string) | null;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly foesAsked: readonly FoeAsk[];
  readonly session: () => Promise<string | null>;
  readonly trips: Trips;
  /** What E does where the player stands, drawn low in the middle of the view. */
  readonly usePrompt: UsePrompt;
  /** What E does at a counter a quest names: speaks with its keeper. */
  readonly speak?: Speak;
  /** What the third-person camera keeps a clear line past, beside the place's boxes: a ship's masts and spars. */
  readonly cameraBlocks?: readonly Block[];
}

/** How far down a player arriving in a social space looks, radians: over the parapet onto the city, as the Tower's
 *  arrival looks out over the City. */
const OVER_THE_PARAPET = 0.3;

/** Stands the player's body at (x, y) facing `facing`, keeping how they hold the camera; in a social space looking
 *  over the parapet. */
export function stand(context: FootContext, x: number, y: number, facing: number, social: boolean): void {
  const { walker, movement } = context;
  const arrived = { ...newPlayer(movement, x, y), view: walker.player.view, yaw: facing, facing };
  walker.player = social ? { ...arrived, pitch: OVER_THE_PARAPET } : arrived;
}

/** Where a player arrives on a patrol leaving one of its dungeons: before entrance `number`'s door, facing out. */
export interface AtEntrance {
  readonly number: number;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
}

/** What the page hears of a room it joins: its snapshots, the player's gear, and whether it takes asks for foes. */
export interface Heard {
  readonly snapshot: (snapshot: Snapshot) => void;
  readonly gear: (gear: GearState) => void;
  readonly asks: boolean;
}

/** A room joined: its link, what is seen to stand in the place, the patrol's node file's text, the dungeon, and the
 *  seas the room stands at. */
export interface Opened {
  readonly link: RoomLink;
  readonly boxes: readonly Block[];
  readonly text: string;
  readonly dungeon: InDungeon | null;
  readonly seas: Difficulty;
}

/** What the room last said of the player's gear (online), of a patrol's entrances, and of a dungeon's cache. */
export interface Held {
  gear: GearState | null;
  readonly entrances: Entrances;
  cache: Cache | null;
  /** An Abyss run's revives left (-1 in any other room), and whether it said this player's company fell. */
  revives: number;
  wiped: boolean;
}
