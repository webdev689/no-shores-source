import { marksMesh } from '../combat/marks.ts';
import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { cardStand, frameAt, type Placed, viewOf } from '../player/figures.ts';
import { Glides } from '../player/glide.ts';
import { IDLE, type InputFrame } from '../player/input.ts';
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
import { type GearHere, gearScreenOpen } from './gearScreen.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { nodeRoom } from './rooms.ts';
import type { Drawer, GameScene } from './scene.ts';
import { HINTS } from './hints.ts';
import { type Standing, standingOf } from './hudLaw.ts';
import { type Rect, windowRect } from './nodes.ts';
import { PlazaLife } from './plazaLife.ts';
import { UsePrompt } from './usePrompt.ts';
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
/** How often a second the rings on the ground are laid again, for their beat. */
const BEATS_A_SECOND = 10;
/** Other players' figures loop a move at this many frames a second where their screen gave no frame. */
const OTHERS_FPS = 6;
/** How far apart in time two figures' steps are, by their numbers, in seconds. */
const STRIDE_APART_S = 0.37;
/** Other players' figures are numbered from here, clear of the player's own, and never twice in the page's life: the
 *  forge keeps each figure's last card by its number, so a number used again would first show another node's figure. */
let nextOtherId = 100;

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
  /** Every other figure drawn: the room's players, then a social space's people. */
  private readonly others: readonly (readonly Placed[])[];
  private readonly fought: FootFight | null;
  private readonly plaza: PlazaLife | null;
  /** The gear's rings on the ground, and what E does where the player stands. */
  private readonly ground: FightMarks;
  private using: Use | null = null;
  /** What E does, shown low in the middle of the view. */
  private readonly prompt: UsePrompt | null;
  /** The gear and the beat the rings were last laid for. */
  private ringsFor: GearState | null = null;
  private ringBeat = -1;
  private rules: MovementRules;
  private reach: Reach = { kind: 'inside' };
  /** Whether the room was lost, and the player walks on alone by the reach rules. */
  private alone = false;
  /** Other players' figures, gliding between snapshots. */
  private readonly glides = new Glides();

  private constructor(
    context: FootContext,
    node: NodeInfo,
    boxes: readonly Block[],
    room: RoomPlay | null,
    others: readonly (readonly Placed[])[],
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
    const hud = document.querySelector<HTMLElement>('#hud');
    this.prompt = hud ? new UsePrompt(hud) : null;
    this.rules = room ? room.rules(fought?.fight ?? null) : this.reachRules();
  }

  /** The rules a player walks by with no room: the movement door's, which judge the edge each tick by the room's own
   *  rules. A dead body is still, as the room keeps it; its standing still ticks, so Respawn comes in time. */
  private reachRules(): MovementRules {
    const { movement } = this.context;
    return {
      ...movement,
      step: (body, controls) => {
        const next = this.reach.kind === 'dead' ? body : movement.step(body, controls);
        this.reach = movement.reachTick(next.x, next.y);
        return next;
      },
    };
  }

  /** Once the room is lost, the player walks on alone: the fight is let go once, and the section judged here, where
   *  they stand now, by the same rules the room judged it by. */
  private goAlone(): void {
    if (this.alone || !this.room || this.room.connected) return;
    this.alone = true;
    this.fought?.leave();
    const { movement } = this.context;
    // The edge is judged on from the room's last word: a body dead stays dead, its time running on.
    const last = this.room.standing;
    this.reach = last.kind === 'warned' ? { kind: 'warned', ticksLeft: last.ticks } : last;
    movement.setSection({ ring: this.node.ring, spawns: this.node.spawns, standing: this.reach });
    this.rules = this.reachRules();
  }

  /** Lands the player in a node at its first spawn, facing `facing`, keeping how they hold the camera. */
  static async enter(context: FootContext, node: NodeInfo, facing: number, seas: Difficulty = 'calm'): Promise<Foot> {
    const { movement, walker, rooms } = context;
    const combat = rooms ? combatRulesOf(await rooms.module) : null;
    const rect = windowRect(node.ring);
    const boxes = await standOn(context, rect, combat);
    movement.setSection(rooms ? null : { ring: node.ring, spawns: node.spawns });
    const [x, y] = node.spawns[0] ?? node.centre;
    const arrived = { ...newPlayer(movement, x, y), view: walker.player.view, yaw: facing, facing };
    walker.player = node.kind === 'social' ? { ...arrived, pitch: OVER_THE_PARAPET } : arrived;
    // The room's players, whom the fight may strike, and a social space's people, whom it never does, are kept apart.
    const [placed, folk]: Placed[][] = [[], []];
    const listedIn = (list: Placed[]): Others => ({
      place: (dress, x, y, facing) => {
        const other = { id: nextOtherId++, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
        list.push(other);
        return other;
      },
      remove: (other) => {
        const index = list.indexOf(other);
        if (index >= 0) list.splice(index, 1);
        context.forge.forget(other.id);
      },
    });
    const others = listedIn(placed);
    const room = rooms
      ? await RoomPlay.join(
          rooms.url(nodeRoom(node, seas)),
          { movement, walker, forge: context.forge, others },
          await context.session,
        )
      : null;
    // A room joined is let go if anything after fails, so no second join finds the first still moving the player.
    try {
      return await Foot.settle(context, node, rect, boxes, combat, room, [placed, folk], listedIn);
    } catch (error) {
      room?.close();
      throw error;
    }
  }

  /** Stands a player joined to a node's room (or none) in it: the ground the room names, their spawn, their fight and
   *  a social space's people. */
  private static async settle(
    context: FootContext,
    node: NodeInfo,
    rect: Rect,
    stood: readonly Block[],
    combat: CombatRules | null,
    room: RoomPlay | null,
    [placed, folk]: Placed[][],
    listedIn: (list: Placed[]) => Others,
  ): Promise<Foot> {
    const { movement, walker } = context;
    const [x, y] = node.spawns[0] ?? node.centre;
    let boxes = stood;
    // The room names the rect its window was cut to; a room baked from older edits is stood on as it stands.
    const bounds = room?.node?.bounds;
    if (bounds && bounds.some((value, index) => Math.abs(value - (rect[index] ?? 0)) > 0.5))
      boxes = await standOn(context, bounds, combat);
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
    const floor = (x: number, y: number) => movement.standing(x, y).z;
    const plaza = node.kind === 'social' ? new PlazaLife(node, listedIn(folk), floor) : null;
    return new Foot(context, node, boxes, room, [placed, folk], fought, plaza);
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

  /** Whether the player has fallen and waits to respawn. */
  get fallen(): boolean {
    return this.reach.kind === 'dead';
  }

  /** A line on the room the player plays in: word that it was lost, else nothing; who is in it shows on the Roster. */
  get roomNote(): string {
    return this.room && !this.room.connected ? 'The room was lost: playing on alone' : '';
  }

  /** One frame on foot: the player plays (with nothing pressed while `paused`), the camera follows, and every figure
   *  is placed for an eye there. */
  frame(controls: InputFrame, seconds: number, clock: number, paused: boolean): FootFrame {
    const { walker, movement, forge, scene } = this.context;
    this.dressInGear();
    // Keys held as the menu opens rest with the rest, so no one walks on behind it.
    const played = paused || gearScreenOpen() ? IDLE : { ...controls, locked: true };
    this.goAlone();
    const fought = this.alone ? null : this.fought;
    walker.frame(played, this.rules, seconds, clock, fought?.press(played, this.boxes));
    const groundAt = (x: number, y: number) => scene.groundAt(x, y);
    const shot = shotOfOrbit(playerCamera(walker.player, movement, this.boxes), LENS, groundAt, CAMERA_CLEARANCE_M);
    const [eyeX, eyeY] = shot.eye;
    const foes = fought?.frame(played, seconds, clock, shot, this.boxes) ?? [];
    this.plaza?.frame(seconds);
    const gear = this.alone ? null : (this.room?.gear ?? null);
    const stations = this.node.stations ?? [];
    // The rings are laid about the node's middle only when the gear changes or their beat steps on, and drawn from
    // the eye wherever it moves.
    const [anchorX, anchorY] = this.node.centre;
    const beat = Math.floor(clock * BEATS_A_SECOND);
    if (gear !== this.ringsFor || beat !== this.ringBeat) {
      [this.ringsFor, this.ringBeat] = [gear, beat];
      const floor = (x: number, y: number) => movement.standing(x, y).z;
      const rings = groundRings(gear, stations, floor, beat / BEATS_A_SECOND);
      this.ground.set(marksMesh([], [], [], rings, [anchorX, anchorY, 0]));
    }
    this.ground.moved([anchorX - shot.eye[0], anchorY - shot.eye[1], -shot.eye[2]]);
    const { x, y } = walker.player.body;
    // E does nothing while a menu is up or the player lies dead, past the edge or felled by a foe.
    const felled = this.fought?.fight.own?.action.kind === 'dead';
    const able = !paused && this.standing.kind !== 'dead' && !felled;
    this.using = able ? useAt(x, y, stations, gear, (asked) => this.room?.askGear(asked)) : null;
    const figures: CardAt[] = [];
    const own = walker.figure(eyeX, eyeY);
    if (own) figures.push(fought ? { ...own, flash: fought.ownFlash } : own);
    // Other players glide between the room's snapshots and flash when struck, as foes do.
    const players = new Map([...(this.room?.othersPlaced ?? [])].map(([number, placed]) => [placed, number]));
    const ticks = { roomTick: fought?.fight.roomTick ?? 0, frameTicks: seconds / movement.tickSeconds };
    for (const placed of this.others.flat()) {
      const number = players.get(placed);
      const [shownX, shownY, shownZ] =
        number === undefined || !fought
          ? [placed.x, placed.y, placed.z]
          : this.glides.follow(number, [placed.x, placed.y, placed.z], ticks.roomTick, ticks.frameTicks);
      const flash = number === undefined || !fought ? undefined : { share: fought.flashOf(number), red: false };
      const { view, flip } = viewOf(placed.facing, shownX, shownY, eyeX, eyeY);
      const frames = forge.frames(placed.dress.body, placed.anim);
      // Each figure keeps a step of its own, so a crowd never walks in step.
      const own = clock + placed.id * STRIDE_APART_S;
      const frame = placed.frame === null ? frameAt(own, frames, OTHERS_FPS) : Math.min(placed.frame, frames - 1);
      const card = forge.card(placed.id, placed.dress, placed.anim, view, frame, flip);
      if (card)
        figures.push({ card, ...cardStand(shownX, shownY, eyeX, eyeY), z: shownZ, flip, ...(flash ? { flash } : {}) });
    }
    this.glides.keep(new Set(players.values()));
    figures.push(...foes);
    const standing = this.standing;
    this.prompt?.show(this.using?.words ?? null);
    const keys = HINTS.foot;
    const drawers = fought ? [this.ground, fought.marks] : [this.ground];
    return { shot, figures, standing, drawers, hints: standing.kind === 'dead' ? HINTS.dead : keys };
  }

  /** Does what E does where the player stands, if anything is within reach. */
  use(): void {
    this.using?.run();
  }

  /** Where the player stands with the section's edge: the room's word online, the reach rules' offline. */
  get standing(): Standing {
    const standing = this.room && !this.alone ? this.room.standing : this.reach;
    if (standing.kind === 'inside') return standingOf('inside', 0);
    return standingOf(standing.kind, 'ticksLeft' in standing ? standing.ticksLeft : standing.ticks);
  }

  /** Asks to come back at the section's spawn nearest where the player died, once Respawn is offered. */
  respawn(): void {
    if (this.room && !this.alone) {
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
    this.prompt?.remove();
    this.ground.release();
    this.room?.close();
    this.context.movement.setSection(null);
  }
}
