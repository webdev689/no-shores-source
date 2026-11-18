import { marksMesh } from '../combat/marks.ts';
import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { cardStand, frameAt, type Placed, viewOf } from '../player/figures.ts';
import type { InputFrame } from '../player/input.ts';
import { newPlayer, playerCamera } from '../player/player.ts';
import type { Others } from '../player/others.ts';
import type { GearState } from '../network/gearMessages.ts';
import { gearOutfit } from '../player/gearLooks.ts';
import { RoomPlay } from '../player/roomPlay.ts';
import type { Walker } from '../player/walker.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { Block, MovementRules, Reach } from '../rules/movementRules.ts';
import type { LandWorker } from '../terrain/landClient.ts';
import { type Shot, shotOfOrbit } from './camera.ts';
import { FightMarks } from './fightMarks.ts';
import { FootFight, combatRulesOf } from './footFight.ts';
import { type Use, groundRings, useAt } from './footGear.ts';
import type { GearHere } from './gearScreen.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { nodeRoom } from './rooms.ts';
import type { Drawer, GameScene } from './scene.ts';
import { HINTS } from './hints.ts';
import { type Standing, standingOf } from './hudLaw.ts';
import { type Rect, windowRect } from './nodes.ts';
import { PlazaLife } from './plazaLife.ts';
import type { NodeInfo } from './worldData.ts';

/** The rooms on foot: each room's address by its name, and the compiled room module the fight's rules come from. */
export interface FootRooms {
  readonly url: (name: string) => string;
  readonly module: Promise<WebAssembly.Module>;
}

/** What a node on foot needs of the game: the movement rules, the land's worker, the player, the forge's cards, the
 *  rooms (null offline), the session's token the rooms keep the player's character by (null for none), and the scene,
 *  whose ground as drawn holds the camera over it and whose GPU draws the fight's marks. */
export interface FootContext {
  readonly movement: MovementRules;
  readonly land: LandWorker;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly rooms: FootRooms | null;
  readonly session: Promise<string | null>;
  readonly scene: GameScene;
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

/** What one frame on foot shows: the shot, every figure, where the player stands with the section's edge, what else
 *  is drawn among them (the gear's rings on the ground, a fight's marks), and the keys listed. */
export interface FootFrame {
  readonly shot: Shot;
  readonly figures: readonly CardAt[];
  readonly standing: Standing;
  readonly drawers: readonly Drawer[];
  readonly hints: readonly string[];
}

/** Stands the movement rules, and the fight's when the player fights, on a node's ground as its room stands its
 *  bodies: its window of the land over the rect, and its city's boxes there as the course. */
async function standOn(context: FootContext, rect: Rect, combat: CombatRules | null): Promise<readonly Block[]> {
  const [windowJson, boxes] = await Promise.all([context.land.window(rect), context.land.boxes(rect)]);
  context.movement.setCourse(boxes);
  combat?.setCourse(boxes);
  if (!context.movement.setGround(windowJson)) throw new Error('the ground of this place did not load');
  // The fight predicts on the same ground, or every tick would be predicted on flat ground at 0 m.
  if (combat && !combat.setGround(windowJson)) throw new Error("the fight's ground of this place did not load");
  return boxes;
}

/** The element the fight's display is drawn in. */
function fightDisplay(): HTMLElement {
  const found = document.querySelector<HTMLElement>('#fight-hud');
  if (!found) throw new Error('the page has no <div id="fight-hud">');
  return found;
}

/**
 * The player on foot in one node: standing on its real ground, among its city's walls, inside its section. Offline,
 * the movement door's reach rules judge the edge each tick and the player only walks; online, the node's room judges
 * it and the player fights there, their fighter predicted on the same ground and set by the room's word, with every
 * other player and foe in the room shown. A social space's keepers and townsfolk walk it, and E uses what is within
 * reach: a station's counter, or a resource node.
 */
export class Foot {
  readonly node: NodeInfo;
  boxes: readonly Block[];
  private readonly context: FootContext;
  private readonly room: RoomPlay | null;
  /** The gear the figure was last dressed in. */
  private dressedIn: GearState | null = null;
  private readonly others: readonly Placed[];
  private readonly fought: FootFight | null;
  private readonly plaza: PlazaLife | null;
  /** The gear's rings on the ground, and what E does where the player stands. */
  private readonly ground: FightMarks;
  private using: Use | null = null;
  private readonly rules: MovementRules;
  private reach: Reach = { kind: 'inside' };

  private constructor(
    context: FootContext,
    node: NodeInfo,
    boxes: readonly Block[],
    room: RoomPlay | null,
    others: readonly Placed[],
    fought: FootFight | null,
    plaza: PlazaLife | null,
  ) {
    this.context = context;
    this.node = node;
    this.boxes = boxes;
    this.room = room;
    this.others = others;
    this.fought = fought;
    this.plaza = plaza;
    this.ground = new FightMarks(context.scene.gpu);
    const { movement } = context;
    this.rules = room
      ? room.rules(fought?.fight ?? null)
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
  static async enter(context: FootContext, node: NodeInfo, facing: number, seas: Difficulty = 'calm'): Promise<Foot> {
    const { movement, walker, rooms } = context;
    const combat = rooms ? combatRulesOf(await rooms.module) : null;
    const rect = windowRect(node.ring);
    let boxes = await standOn(context, rect, combat);
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
          rooms.url(nodeRoom(node, seas)),
          { movement, walker, forge: context.forge, others },
          await context.session,
        )
      : null;
    // The room names the rect its window was cut to; a room baked from older edits is stood on as it stands.
    const bounds = room?.node?.bounds;
    try {
      if (bounds && bounds.some((value, index) => Math.abs(value - (rect[index] ?? 0)) > 0.5))
        boxes = await standOn(context, bounds, combat);
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
    const { link } = room ?? {};
    const fightContext = { walker, forge: context.forge, movement, scene: context.scene, others: placed };
    const fought =
      combat && link ? new FootFight({ ...fightContext, rules: combat, link, root: fightDisplay() }) : null;
    const plaza = node.kind === 'social' ? new PlazaLife(node, others, (x, y) => movement.standing(x, y).z) : null;
    return new Foot(context, node, boxes, room, placed, fought, plaza);
  }

  /** Dresses the player's figure in their gear as their room last sent it, once it changes. */
  private dressInGear(): void {
    const gear = this.room?.gear ?? null;
    if (!gear || gear === this.dressedIn) return;
    this.dressedIn = gear;
    const { walker, forge } = this.context;
    const wardrobe = forge.wardrobe(walker.you.dress.body);
    if (wardrobe)
      walker.you.dress = { ...walker.you.dress, outfit: gearOutfit(gear, wardrobe, walker.you.dress.outfit) };
  }

  /** The player's gear in their room, and the way to ask of it; null offline or once the room is lost. */
  get gear(): GearHere | null {
    const room = this.room;
    const { forge, walker } = this.context;
    return room?.connected
      ? { gear: room.gear, ask: (ask) => room.askGear(ask), forge, dress: walker.you.dress }
      : null;
  }

  /** A line on the room the player plays in: their number in it, word that it was lost, or nothing offline. */
  get roomNote(): string {
    if (!this.room) return '';
    return this.room.connected ? `In the room as player ${this.room.player}` : 'The room was lost: playing on alone';
  }

  /** One frame on foot: the player plays (with nothing pressed while `paused`), the camera follows, and every figure
   *  is placed for an eye there. */
  frame(controls: InputFrame, seconds: number, clock: number, paused: boolean): FootFrame {
    const { walker, movement, forge, scene } = this.context;
    this.dressInGear();
    const played = paused ? IDLE : { ...controls, locked: true };
    // Once the room is lost the player walks on alone, and fights no more.
    const fought = this.room?.connected ? this.fought : null;
    if (this.fought && !fought) this.fought.leave();
    walker.frame(played, this.rules, seconds, clock, fought?.press(played, this.boxes));
    const groundAt = (x: number, y: number) => scene.groundAt(x, y);
    const shot = shotOfOrbit(playerCamera(walker.player, movement, this.boxes), LENS, groundAt, CAMERA_CLEARANCE_M);
    const [eyeX, eyeY] = shot.eye;
    const foes = fought?.frame(played, seconds, clock, shot, this.boxes) ?? [];
    this.plaza?.frame(seconds);
    const gear = this.room?.connected ? this.room.gear : null;
    const stations = this.node.stations ?? [];
    const floor = (x: number, y: number) => movement.standing(x, y).z;
    this.ground.set(marksMesh([], [], [], groundRings(gear, stations, floor, clock), shot.eye));
    const { x, y } = walker.player.body;
    this.using = useAt(x, y, stations, gear, (asked) => this.room?.askGear(asked));
    const figures: CardAt[] = [];
    const own = walker.figure(eyeX, eyeY);
    if (own) figures.push(fought ? { ...own, flash: fought.ownFlash } : own);
    for (const placed of this.others) {
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eyeX, eyeY);
      const frames = forge.frames(placed.dress.body, placed.anim);
      const frame = placed.frame === null ? frameAt(clock, frames, OTHERS_FPS) : Math.min(placed.frame, frames - 1);
      const card = forge.card(placed.id, placed.dress, placed.anim, view, frame, flip);
      if (card) figures.push({ card, ...cardStand(placed.x, placed.y, eyeX, eyeY), z: placed.z, flip });
    }
    figures.push(...foes);
    const standing = this.standing;
    const keys = this.using ? [this.using.words, ...HINTS.foot] : HINTS.foot;
    const drawers = fought ? [this.ground, fought.marks] : [this.ground];
    return { shot, figures, standing, drawers, hints: standing.kind === 'dead' ? HINTS.dead : keys };
  }

  /** Does what E does where the player stands, if anything is within reach. */
  use(): void {
    this.using?.run();
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
    this.fought?.leave();
    this.plaza?.close();
    this.ground.release();
    this.room?.close();
    this.context.movement.setSection(null);
  }
}
