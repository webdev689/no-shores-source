// Where a player stands on foot and the room they join there: the node's ground, its file for a room playing alone, and
// what the page hears of the room. The fight's rules on the room's module are made in `footRoom.ts`.
import type { EncounterSeen } from '../network/encounterMessages.ts';
import type { BreachSeen } from '../network/breachMessages.ts';
import type { Cache } from './dungeonChest.ts';
import type { Entrances, Trips } from './footTrips.ts';
import type { GearAsk, GearState } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { FoeAsk, Reviving } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { Cards } from '../player/cards.ts';
import { newPlayer } from '../player/player.ts';
import type { Walker } from '../player/walker.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import type { LandWorker } from '../terrain/landClient.ts';
import type { InDungeon } from './footTrips.ts';
import type { InBreach } from './breachView.ts';
import type { Speak } from './footGear.ts';
import type { UsePrompt } from './usePrompt.ts';
import type { EventProp } from '../city/eventProps.ts';
import type { HudFrame } from '../combat/hud.ts';
import type { CardAt } from '../player/cards.ts';
import type { Shot } from './camera.ts';
import type { Use } from './footGear.ts';
import type { Strip } from './hints.ts';
import type { Standing } from './hudLaw.ts';
import type { Quest } from './tasks.ts';
import { guildRead } from './guild/guildHeld.ts';
import { GUILD_CHANGED } from './gearScreen.ts';
import { nodeRoom } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';
import type { MapMarks } from '../heldmap/landSheet.ts';

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

/** The guild whose outpost's room a player arriving at an outpost site joins: `asked`, a companion's (null for the
 *  wild site), else the player's own read afresh; `own` while it is the player's own. Null at any other node. */
export interface OutpostJoined {
  readonly guild: string | null;
  readonly own: boolean;
}

export async function outpostJoined(node: NodeInfo, asked?: string | null): Promise<OutpostJoined | null> {
  if (node.kind !== 'outpost') return null;
  const mine = (await guildRead())?.key ?? null;
  return asked === undefined || asked === mine ? { guild: mine, own: true } : { guild: asked, own: false };
}

/** Where a player stands on foot, as a guild change at an outpost site reads it. */
interface AtOutpost {
  readonly node: NodeInfo;
  readonly seas: Difficulty;
  readonly outpost: { rejoins(key: string | null): boolean } | null;
}

/** Calls `rejoin` where the player, at an outpost site in their own guild's outpost's room or the wild site's, founds,
 *  joins or leaves a guild (`here` none while nothing may take them elsewhere), so they join the room they belong in. */
export function rejoinOnGuild(here: () => AtOutpost | null, rejoin: (standing: AtOutpost) => void): void {
  addEventListener(GUILD_CHANGED, () => {
    const standing = here();
    void guildRead().then((guild) => {
      if (standing && here() === standing && standing.outpost?.rejoins(guild?.key ?? null)) rejoin(standing);
    });
  });
}

/** The address of the room a player arriving at a node joins (null offline), at the entrance they come out of or
 *  logging back in (`joinAsk`): at an outpost site, the room of the outpost of `guild`, or the wild site for none. */
export function nodeAddress(
  context: FootContext,
  node: NodeInfo,
  seas: Difficulty,
  asked: AtEntrance | 'relog' | undefined,
  guild: string | null,
): string | null {
  if (!context.rooms) return null;
  return `${context.rooms(nodeRoom(node, seas, guild))}${joinAsk(asked)}`;
}

/** Where a player arrives on a patrol leaving one of its dungeons: before entrance `number`'s door, facing out; or
 *  launched for a Breach's run (`breach`), at its gate, where the zone's room stands them in the run's company. */
export interface AtEntrance {
  readonly number: number;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly breach?: string;
}

/** What a room's address asks of it for a player arriving as `arriving` says: the entrance they stand before, or the
 *  Breach's run they were launched for. */
export const arrivalQuery = (arriving: AtEntrance): string =>
  arriving.breach === undefined ? `?entrance=${arriving.number}` : `?breach=${encodeURIComponent(arriving.breach)}`;

/** What the page hears of a room it joins: its snapshots, the player's gear, and whether it takes asks for foes. */
export interface Heard {
  readonly snapshot: (snapshot: Snapshot) => void;
  readonly gear: (gear: GearState) => void;
  readonly asks: boolean;
}

/** A room joined: its link, what is seen to stand in the place, the patrol's node file's text, the dungeon, the
 *  seas the room stands at, and at an outpost site whose outpost's room it is; in a Breach's run, the run, and the
 *  ground its blocks give in place of the land's; at a Breach's gate, the run its zone was joined for. */
export interface Opened {
  readonly link: RoomLink;
  readonly boxes: readonly Block[];
  readonly text: string;
  readonly dungeon: InDungeon | null;
  readonly seas: Difficulty;
  readonly outpost?: OutpostJoined | null;
  readonly run?: InBreach;
  readonly launchedFor?: string;
  readonly groundAt?: (x: number, y: number) => number | null;
}

/** What the room last said of the player's gear (online), of a patrol's entrances, and of a dungeon's cache and
 *  encounters. */
export interface Held {
  gear: GearState | null;
  /** Alone, the room's word on the player's gear, read only for their public events' chests: the page dresses and
   *  serves nothing else from a character that is not kept. */
  alone: GearState | null;
  readonly entrances: Entrances;
  cache: Cache | null;
  /** An Abyss run's revives left (-1 in any other room), and whether it said this player's company fell; whether the
   *  darkness holds the player where they lie, and who is reviving whom (`footRevive.ts`). */
  revives: number;
  wiped: boolean;
  darkness: boolean;
  reviving: readonly Reviving[];
  /** An Elite Dungeon's encounters as its room last said; null in any other room. */
  encounter: EncounterSeen | null;
  /** At a guild's outpost, how many plots its room has stood (0 in any other room): its plot is read again on a change. */
  plots: number;
  /** A Breach as its run or its gate's patrol zone last said; null in any other room. */
  breach: BreachSeen | null;
}

/** What a join into a node's room asks of it besides: to stand before an entrance's door, coming out of its dungeon,
 *  or at the gate of the Breach's run the player was launched for (`arrivalQuery`); or to stand where the kept
 *  character left this social space, logging back in (`relog.ts`). */
export const joinAsk = (asked?: AtEntrance | 'relog'): string =>
  asked === 'relog' ? '?relog=1' : asked ? arrivalQuery(asked) : '';

/** What E does where a player stands on a place of its own, if anything: with the way to ask of their gear. */
export type Uses = (x: number, y: number, ask: (asked: GearAsk) => void) => Use | null;

/** What the fight's display is drawn from on foot, but the camera, the canvas and a lost room (the game's own line
 *  tells of that). */
export type FootFight = Omit<HudFrame, 'matrix' | 'width' | 'height' | 'lost' | 'groundAt'>;

/** What a frame on foot is asked: whether play is paused or the map is looked at, whether the hands are free, the
 *  view's aspect, and the eye of a cutscene's shot shown in place of the player's own (the stranger's welcome), which
 *  the figures are then drawn for. */
export interface FootAsk {
  readonly paused: boolean;
  readonly looking?: boolean;
  readonly hands: boolean;
  readonly aspect: number;
  readonly eye?: readonly [number, number, number] | null;
}

/** What one frame on foot shows: the shot, every figure, where the player stands with the section's edge, the
 *  fight (its marks on the ground and in the air, measured from the eye, with the marks over what the player can use
 *  and the nodes' beams; the lit keepers' marks, measured alike, drawn over everything; the arcs of its blows, in
 *  world metres; and what its display shows), the keys listed, and the zone's public event: its props, the tracker's
 *  quest and the music's moment for a beat this frame. */
export interface FootFrame {
  readonly shot: Shot;
  readonly figures: readonly CardAt[];
  readonly standing: Standing;
  readonly marks: Float32Array;
  readonly lit: readonly number[];
  /** The marks over what the player can use, measured from the eye, drawn faded only where something hides them. */
  readonly hidden?: Float32Array;
  readonly swings: Float32Array;
  readonly fight: FootFight;
  readonly hints: Strip;
  readonly dark: number;
  readonly props?: readonly EventProp[];
  readonly quest?: Quest | null;
  readonly sting?: 'cadence' | 'victory' | 'defeat' | null;
  /** What moves on the land's held map, worked out only while it is up. */
  readonly map?: () => MapMarks;
}

/** Runs `work` on a room just joined by `link`; should it throw, the link is let go first, so a trip that failed after
 *  its room joined never rejoins later and takes the character from the room the player is really in. */
export async function closedIfThrown<T>(link: { close?(): void }, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    link.close?.();
    throw error;
  }
}
