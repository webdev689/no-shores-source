// Where a player stands on foot and the room they join there: the node's ground, its file for a room in the page, the
// fight's rules on the room's module, and what the page hears of the room.
import type { Cache } from './dungeonChest.ts';
import type { Entrances, Trips } from './footTrips.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { FoeAsk } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { Cards } from '../player/cards.ts';
import { newPlayer } from '../player/player.ts';
import type { Walker } from '../player/walker.ts';
import { type CombatRules, startCombatRules } from '../rules/combatRules.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import { type FoeType, rosterOf } from '../rules/roster.ts';
import type { LandWorker } from '../terrain/landClient.ts';
import type { InDungeon } from './footTrips.ts';
import type { Rect } from './nodes.ts';
import type { NodeInfo } from './worldData.ts';

/** What a node on foot needs of the game: the movement rules, the land's worker, the player, the forge's cards, the
 *  rooms (null offline), the room's compiled module, the ground as drawn (to hold the camera over it), the foes to
 *  ask a room in the page for (none but under `npm run dev`), the session's token the rooms keep the player's
 *  character by (null for none), and the ways into a patrol's dungeons and out. */
export interface FootContext {
  readonly movement: MovementRules;
  readonly land: LandWorker;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly rooms: ((name: string) => string) | null;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly foesAsked: readonly FoeAsk[];
  readonly session: Promise<string | null>;
  readonly trips: Trips;
}

/** How far down a player arriving in a social space looks, radians: over the parapet onto the city, as the Tower's
 *  arrival looks out over the City. */
const OVER_THE_PARAPET = 0.3;

/** The fight's rules and roster on the room's module, made once. */
const fightRules = new WeakMap<WebAssembly.Module, { combat: CombatRules; roster: readonly FoeType[] }>();

/** Cuts a node's window of the land over the rect, and its city's boxes there, and stands the movement rules and the
 *  fight's on them as its room stands its bodies. Answers the boxes and the window's text. */
export async function standOn(
  context: FootContext,
  combat: CombatRules,
  rect: Rect,
): Promise<{ boxes: readonly Block[]; ground: string }> {
  const [ground, boxes] = await Promise.all([context.land.window(rect), context.land.boxes(rect)]);
  context.movement.setCourse(boxes);
  combat.setCourse(boxes);
  if (!context.movement.setGround(ground) || !combat.setGround(ground))
    throw new Error('the ground of this place did not load');
  return { boxes, ground };
}

/** A node's file as the bake writes it, for a room in the page: its section and window rect, the window of the land
 *  cut there, and its boxes. */
export function nodeText(node: NodeInfo, rect: Rect, ground: string, boxes: readonly Block[]): string {
  const box = boxes.map((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top]);
  const { id, kind, continent, ring, spawns } = node;
  return `{"id":${JSON.stringify(id)},"kind":${JSON.stringify(kind)},"continent":${JSON.stringify(continent)},"ring":${JSON.stringify(ring)},"spawns":${JSON.stringify(spawns)},"bounds":${JSON.stringify(rect)},"boxes":${JSON.stringify(box)},"ground":${ground}}`;
}

/** The fight's rules and roster on the context's room module, made once, and the module. */
export async function rulesOf(context: FootContext) {
  const module = await context.roomModule;
  const rules = fightRules.get(module) ?? { combat: startCombatRules(module), roster: rosterOf(module) };
  fightRules.set(module, rules);
  return { module, rules };
}

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

/** A room joined: its link, what is seen to stand in the place, the patrol's node file's text, and the dungeon. */
export interface Opened {
  readonly link: RoomLink;
  readonly boxes: readonly Block[];
  readonly text: string;
  readonly dungeon: InDungeon | null;
}

/** What the room last said of the player's gear (online), of a patrol's entrances, and of a dungeon's cache. */
export interface Held {
  gear: GearState | null;
  readonly entrances: Entrances;
  cache: Cache | null;
}
