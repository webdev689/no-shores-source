import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { cardStand, frameAt, type Placed, viewOf } from '../player/figures.ts';
import type { InputFrame } from '../player/input.ts';
import { newPlayer, playerCamera } from '../player/player.ts';
import type { Others } from '../player/others.ts';
import { RoomPlay } from '../player/roomPlay.ts';
import type { Walker } from '../player/walker.ts';
import type { Block, MovementRules, Reach } from '../rules/movementRules.ts';
import type { LandWorker } from '../terrain/landClient.ts';
import { type Shot, shotOfOrbit } from './camera.ts';
import type { GearHere } from './gearScreen.ts';
import { type Standing, standingOf } from './hudLaw.ts';
import { type Rect, windowRect } from './nodes.ts';
import type { NodeInfo } from './worldData.ts';

/** What a node on foot needs of the game: the movement rules, the land's worker, the player, the forge's cards, the
 *  rooms (null offline), the session's token the rooms keep the player's character by (null for none), and the ground
 *  as drawn, to hold the camera over it. */
export interface FootContext {
  readonly movement: MovementRules;
  readonly land: LandWorker;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly rooms: ((name: string) => string) | null;
  readonly session: Promise<string | null>;
  readonly groundAt: (x: number, y: number) => number | null;
}

/** The lens on foot: the Test Ground's field of view, near enough for the first person's eye, far to the haze. */
const LENS = { fov: FIELD_OF_VIEW, near: 0.1, far: 60_000 } as const;
/** How far over the ground the third-person camera is held. */
const CAMERA_CLEARANCE_M = 0.3;
/** How far down a player arriving in a social space looks, radians: over the parapet onto the city, as the Tower's
 *  arrival looks out over the City. */
const OVER_THE_PARAPET = 0.3;
/** Other players' figures loop a move at this many frames a second where their screen gave no frame. */
const OTHERS_FPS = 6;
/** Other players' figures are numbered from here, clear of the player's own, and never twice in the page's life: the
 *  forge keeps each figure's last card by its number, so a number used again would first show another node's figure. */
let nextOtherId = 100;
/** A frame with nothing pressed: what the body is stepped by while a menu is open, so the world goes on. */
export const IDLE: InputFrame = {
  held: () => false,
  pressed: () => false,
  released: () => false,
  lookX: 0,
  lookY: 0,
  wheel: 0,
  locked: true,
};

/** What one frame on foot shows: the shot, every figure, and where the player stands with the section's edge. */
export interface FootFrame {
  readonly shot: Shot;
  readonly figures: readonly CardAt[];
  readonly standing: Standing;
}

/** Stands the movement rules on a node's ground as its room stands its bodies: its window of the land over the
 *  rect, and its city's boxes there as the course. */
async function standOn(context: FootContext, rect: Rect): Promise<readonly Block[]> {
  const [windowJson, boxes] = await Promise.all([context.land.window(rect), context.land.boxes(rect)]);
  context.movement.setCourse(boxes);
  if (!context.movement.setGround(windowJson)) throw new Error('the ground of this place did not load');
  return boxes;
}

/**
 * The player on foot in one node: standing on its real ground, among its city's walls, inside its section. Offline,
 * the movement door's reach rules judge the edge each tick; online, the node's room judges it and the player is
 * predicted on the same ground and corrected by the room's word, with every other player in the room shown.
 */
export class Foot {
  readonly node: NodeInfo;
  boxes: readonly Block[];
  private readonly context: FootContext;
  private readonly room: RoomPlay | null;
  private readonly others: readonly Placed[];
  private readonly rules: MovementRules;
  private reach: Reach = { kind: 'inside' };

  private constructor(
    context: FootContext,
    node: NodeInfo,
    boxes: readonly Block[],
    room: RoomPlay | null,
    others: readonly Placed[],
  ) {
    this.context = context;
    this.node = node;
    this.boxes = boxes;
    this.room = room;
    this.others = others;
    const { movement } = context;
    this.rules = room
      ? room.rules()
      : {
          ...movement,
          // A dead body is still, as the room keeps it; its standing still ticks, so Respawn comes in time.
          step: (body, controls) => {
            const next = this.reach.kind === 'dead' ? body : movement.step(body, controls);
            this.reach = movement.reachTick(next.x, next.y);
            return next;
          },
        };
  }

  /** Lands the player in a node at its first spawn, facing `facing`, keeping how they hold the camera. */
  static async enter(context: FootContext, node: NodeInfo, facing: number): Promise<Foot> {
    const { movement, walker, rooms } = context;
    const rect = windowRect(node.ring);
    let boxes = await standOn(context, rect);
    movement.setSection(rooms ? null : { ring: node.ring, spawns: node.spawns });
    const [x, y] = node.spawns[0] ?? node.centre;
    const arrived = { ...newPlayer(movement, x, y), view: walker.player.view, yaw: facing, facing };
    walker.player = node.kind === 'social' ? { ...arrived, pitch: OVER_THE_PARAPET } : arrived;
    const placed: Placed[] = [];
    const others: Others = {
      place: (dress, x, y, facing) => {
        const other = { id: nextOtherId++, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
        placed.push(other);
        return other;
      },
      remove: (other) => {
        const index = placed.indexOf(other);
        if (index >= 0) placed.splice(index, 1);
      },
    };
    const room = rooms
      ? await RoomPlay.join(
          rooms(`node-${node.id}`),
          { movement, walker, forge: context.forge, others },
          await context.session,
        )
      : null;
    // The room names the rect its window was cut to; a room baked from older edits is stood on as it stands.
    const bounds = room?.node?.bounds;
    try {
      if (bounds && bounds.some((value, index) => Math.abs(value - (rect[index] ?? 0)) > 0.5))
        boxes = await standOn(context, bounds);
    } catch (error) {
      room?.close();
      throw error;
    }
    if (room && node.spawns.length > 1) {
      // The room stands each player who joins at the next of the node's spawns in turn; the player starts there too.
      const [spawnX, spawnY] = node.spawns[(room.player - 1) % node.spawns.length] ?? [x, y];
      const standing = movement.standing(spawnX, spawnY);
      walker.player = { ...walker.player, body: standing, previous: standing };
    }
    return new Foot(context, node, boxes, room, placed);
  }

  /** The player's gear in their room, and the way to ask of it; null offline or once the room is lost. */
  get gear(): GearHere | null {
    const room = this.room;
    return room?.connected ? { gear: room.gear, ask: (ask) => room.askGear(ask) } : null;
  }

  /** A line on the room the player plays in: their number in it, word that it was lost, or nothing offline. */
  get roomNote(): string {
    if (!this.room) return '';
    return this.room.connected ? `In the room as player ${this.room.player}` : 'The room was lost: playing on alone';
  }

  /** One frame on foot: the player plays (with nothing pressed while `paused`), the camera follows, and every figure
   *  is placed for an eye there. */
  frame(controls: InputFrame, seconds: number, clock: number, paused: boolean): FootFrame {
    const { walker, movement, forge, groundAt } = this.context;
    walker.frame(paused ? IDLE : { ...controls, locked: true }, this.rules, seconds, clock);
    const shot = shotOfOrbit(playerCamera(walker.player, movement, this.boxes), LENS, groundAt, CAMERA_CLEARANCE_M);
    const [eyeX, eyeY] = shot.eye;
    const figures: CardAt[] = [];
    const own = walker.figure(eyeX, eyeY);
    if (own) figures.push(own);
    for (const placed of this.others) {
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eyeX, eyeY);
      const frames = forge.frames(placed.dress.body, placed.anim);
      const frame = placed.frame === null ? frameAt(clock, frames, OTHERS_FPS) : Math.min(placed.frame, frames - 1);
      const card = forge.card(placed.id, placed.dress, placed.anim, view, frame, flip);
      if (card) figures.push({ card, ...cardStand(placed.x, placed.y, eyeX, eyeY), z: placed.z, flip });
    }
    return { shot, figures, standing: this.standing };
  }

  /** Where the player stands with the section's edge: the room's word online, the reach rules' offline. */
  get standing(): Standing {
    const standing = this.room?.standing ?? this.reach;
    if (standing.kind === 'inside') return standingOf('inside', 0);
    return standingOf(standing.kind, 'ticksLeft' in standing ? standing.ticksLeft : standing.ticks);
  }

  /** Asks to come back at the section's spawn nearest where the player died, once Respawn is offered. */
  respawn(): void {
    if (this.room) {
      this.room.askRespawn();
      return;
    }
    const { movement, walker } = this.context;
    const { body } = walker.player;
    const spawn = movement.respawn(body.x, body.y);
    if (!spawn) return;
    const standing = movement.standing(spawn[0], spawn[1]);
    walker.player = { ...walker.player, body: standing, previous: standing, carry: 0 };
    this.reach = { kind: 'inside' };
  }

  /** Leaves the node: its room lets the player go, and no section judges them. */
  leave(): void {
    this.room?.close();
    this.context.movement.setSection(null);
  }
}
