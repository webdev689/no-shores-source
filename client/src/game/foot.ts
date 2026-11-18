import { FightEffects } from '../combat/fightEffects.ts';
import { Fighting } from '../combat/fighting.ts';
import { FoeFigures } from '../combat/foeFigures.ts';
import type { HudFrame } from '../combat/hud.ts';
import { PlayerFight } from '../combat/playerFight.ts';
import { figureMuzzle, screenMuzzle } from '../combat/tracers.ts';
import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import type { FoeAsk } from '../network/messages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../network/roomConnection.ts';
import type { CardAt, Cards } from '../player/cards.ts';
import { crosshairPoint } from '../player/crosshair.ts';
import { cardStand, frameAt, viewOf } from '../player/figures.ts';
import { Glides } from '../player/glide.ts';
import type { InputFrame } from '../player/input.ts';
import { newPlayer, playerCamera, shownBody } from '../player/player.ts';
import { OtherPlayers } from '../player/others.ts';
import type { Walker } from '../player/walker.ts';
import { type CombatRules, startCombatRules } from '../rules/combatRules.ts';
import { FIGHT_TICKS } from '../player/fightMoves.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import { type FoeType, rosterOf } from '../rules/roster.ts';
import type { LandWorker } from '../terrain/landClient.ts';
import { type Shot, shotOfOrbit } from './camera.ts';
import { type Standing, standingOf } from './hudLaw.ts';
import { type Rect, windowRect } from './nodes.ts';
import type { NodeInfo } from './worldData.ts';

/** What a node on foot needs of the game: the movement rules, the land's worker, the player, the forge's cards, the
 *  rooms (null offline), the room's compiled module, the ground as drawn (to hold the camera over it), and the foes to
 *  ask a room in the page for (none but under `npm run dev`). */
export interface FootContext {
  readonly movement: MovementRules;
  readonly land: LandWorker;
  readonly walker: Walker;
  readonly forge: Cards;
  readonly rooms: ((name: string) => string) | null;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly foesAsked: readonly FoeAsk[];
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

/** The fight's rules and roster on the room's module, made once. */
const fightRules = new WeakMap<WebAssembly.Module, { combat: CombatRules; roster: readonly FoeType[] }>();

/** What the fight's display is drawn from on foot, but the camera, the canvas and a lost room (the game's own line
 *  tells of that). */
export type FootFight = Omit<HudFrame, 'matrix' | 'width' | 'height' | 'lost'>;

/** What one frame on foot shows: the shot, every figure, where the player stands with the section's edge, and the
 *  fight: its marks on the ground and in the air (measured from the eye) and what its display shows. */
export interface FootFrame {
  readonly shot: Shot;
  readonly figures: readonly CardAt[];
  readonly standing: Standing;
  readonly marks: Float32Array;
  readonly fight: FootFight;
}

/** Cuts a node's window of the land over the rect, and its city's boxes there, and stands the movement rules and the
 *  fight's on them as its room stands its bodies. Answers the boxes and the window's text. */
async function standOn(
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
function nodeText(node: NodeInfo, rect: Rect, ground: string, boxes: readonly Block[]): string {
  const box = boxes.map((block) => [block.minX, block.minY, block.maxX, block.maxY, block.top]);
  const { id, kind, ring, spawns } = node;
  return `{"id":${JSON.stringify(id)},"kind":${JSON.stringify(kind)},"ring":${JSON.stringify(ring)},"spawns":${JSON.stringify(spawns)},"bounds":${JSON.stringify(rect)},"boxes":${JSON.stringify(box)},"ground":${ground}}`;
}

/**
 * The player on foot in one node: standing on its real ground, among its city's walls, inside its section, fighting
 * whatever foes its room holds as the Test Ground fights. The node's room is the authority: alone, the room crate runs
 * in the page on the same ground; online, the server's. It judges the edge and the fight, and the page predicts the
 * player by its own rules and takes its word; every other player and foe is shown where it last saw them.
 */
export class Foot {
  readonly node: NodeInfo;
  readonly boxes: readonly Block[];
  private readonly context: FootContext;
  private readonly link: RoomLink;
  readonly fight: Fighting;
  private readonly player: PlayerFight;
  private readonly steps: MovementRules;
  private readonly otherPlayers: OtherPlayers;
  private readonly otherGlides = new Glides();
  private readonly foes: FoeFigures;
  private readonly effects = new FightEffects();
  /** The link's welcomes followed: one more means the player joined the room again. */
  private joined = 1;

  private constructor(
    context: FootContext,
    node: NodeInfo,
    boxes: readonly Block[],
    parts: { link: RoomLink; fight: Fighting; combat: CombatRules; roster: readonly FoeType[] },
    otherPlayers: OtherPlayers,
  ) {
    this.context = context;
    this.node = node;
    this.boxes = boxes;
    this.link = parts.link;
    this.fight = parts.fight;
    this.player = new PlayerFight(parts.fight, parts.combat, context.walker);
    this.steps = parts.fight.steps(context.movement);
    this.otherPlayers = otherPlayers;
    this.foes = new FoeFigures(parts.roster);
  }

  /** Lands the player in a node at its first spawn, facing `facing`, keeping how they hold the camera, and joins its
   *  room: online the server's, alone one in the page that may stand the foes the context asks for. */
  static async enter(context: FootContext, node: NodeInfo, facing: number): Promise<Foot> {
    const { movement, walker, rooms, forge } = context;
    const module = await context.roomModule;
    const rules = fightRules.get(module) ?? { combat: startCombatRules(module), roster: rosterOf(module) };
    fightRules.set(module, rules);
    const { combat } = rules;
    let rect = windowRect(node.ring);
    let { boxes, ground } = await standOn(context, combat, rect);
    const [x, y] = node.spawns[0] ?? node.centre;
    const arrived = { ...newPlayer(movement, x, y), view: walker.player.view, yaw: facing, facing };
    walker.player = node.kind === 'social' ? { ...arrived, pitch: OVER_THE_PARAPET } : arrived;
    const players = new OtherPlayers({
      place: (dress, x, y, facing) => ({
        id: nextOtherId++,
        x,
        y,
        z: 0,
        facing,
        dress,
        anim: 'idle',
        frame: null,
        spin: false,
      }),
      remove: () => undefined,
    });
    let fight: Fighting | null = null;
    const received = (snapshot: Snapshot) => {
      players.takeDresses(snapshot.dressed);
      fight?.receive(snapshot);
      // Before the fight stands there is no own number to tell the player from the others.
      if (fight) players.seen(snapshot.players, fight.player, forge);
    };
    const asked = rooms ? [] : context.foesAsked;
    const connection = rooms ? await RoomConnection.open(rooms(`node-${node.id}`), received) : null;
    // The room names the rect its window was cut to; a room baked from older edits is stood on as it stands.
    const bounds = connection?.node?.bounds;
    try {
      if (bounds && bounds.some((value, index) => Math.abs(value - (rect[index] ?? 0)) > 0.5)) {
        rect = [bounds[0] ?? 0, bounds[1] ?? 0, bounds[2] ?? 0, bounds[3] ?? 0];
        ({ boxes, ground } = await standOn(context, combat, rect));
      }
    } catch (error) {
      connection?.close();
      throw error;
    }
    const link =
      connection ?? LocalRoom.openNode(module, nodeText(node, rect, ground, boxes), received, asked.length > 0);
    fight = new Fighting(combat, link);
    for (const foe of asked) fight.ask(foe);
    // The player starts at the first spawn, where the room stands its first to join; the room's word moves a later
    // one to the spawn its turn gives, which its number does not tell, since the garrison's foes are numbered too.
    players.takeDresses(link.dressed);
    return new Foot(context, node, boxes, { link, fight, ...rules }, players);
  }

  /** Whether the room's socket closed and the page is joining it again. */
  get rejoining(): boolean {
    return this.link.rejoining;
  }

  /** A line on the room the player plays in: their number in it or word that it was lost; nothing alone. */
  get roomNote(): string {
    if (!(this.link instanceof RoomConnection)) return '';
    if (this.link.rejoining) return 'Reconnecting…';
    return this.link.open ? `In the room as player ${this.link.player}` : 'The room was lost: playing on alone';
  }

  /** One frame on foot: the player plays and fights (with nothing pressed while `paused`, the fight's buttons only
   *  while `hands`), the room's clock runs, the camera follows, and every figure, foe and mark is placed for an eye
   *  there. */
  frame(
    controls: InputFrame,
    seconds: number,
    clock: number,
    { paused, hands, aspect }: { paused: boolean; hands: boolean; aspect: number },
  ): FootFrame {
    const { walker, movement, forge, groundAt } = this.context;
    const { fight, foes, effects } = this;
    if (this.link.joins !== this.joined) {
      // A link that joined its room again brings every dress there with its welcome.
      this.joined = this.link.joins;
      this.otherPlayers.takeDresses(this.link.dressed);
    }
    const standing = [...foes.placed.values(), ...this.otherPlayers.placed.values()];
    const bodies = standing.map((placed) => [placed.x, placed.y, placed.z] as const);
    const camera = () => playerCamera(walker.player, movement, this.boxes);
    const shown = this.player.frame(paused ? IDLE : { ...controls, locked: true }, this.steps, seconds, clock, {
      running: true,
      hands: hands && !paused,
      markOf: () => crosshairPoint(camera(), aspect, this.boxes, bodies, groundAt),
      zoomOf: () => camera().zoom ?? 1,
    });
    const events = effects.events(fight, seconds);
    const shot = shotOfOrbit(camera(), LENS, groundAt, CAMERA_CLEARANCE_M);
    const [eyeX, eyeY] = shot.eye;
    const frameTicks = seconds / movement.tickSeconds;
    const figures: CardAt[] = [];
    const own = walker.figure(eyeX, eyeY, { share: effects.flashes.shareOf(fight.player), red: true });
    if (own) figures.push(own);
    figures.push(...this.otherCards(eyeX, eyeY, clock, frameTicks));
    figures.push(
      ...foes.cards(fight, forge, { x: eyeX, y: eyeY }, clock, frameTicks, movement.tickSeconds, effects.flashes),
    );
    const body = shownBody(walker.player);
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's along its shot.
    const muzzle = walker.muzzle;
    const marks = effects.marks(fight, seconds, {
      eye: shot.eye,
      blocks: this.boxes,
      bodies,
      muzzleOf: (fired) =>
        muzzle
          ? screenMuzzle(camera(), aspect, muzzle)
          : figureMuzzle([body.x, body.y, body.z], Math.atan2(fired.velocity[0], -fired.velocity[1])),
      origin: shot.eye,
      groundAt,
    });
    const ownView = fight.own;
    const where = (id: number): readonly [number, number, number] | null => {
      if (id === fight.player && ownView) return [ownView.x, ownView.y, ownView.z];
      const figure = foes.placed.get(id) ?? this.otherPlayers.placed.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    const firstPerson = walker.inFirstPerson;
    const drawing = walker.you.dress.outfit.right?.startsWith('bow') && ownView?.action.kind === 'draw';
    const fought: FootFight = {
      own: ownView,
      foes: foes.marked(fight),
      where,
      events,
      blocks: this.boxes,
      player: fight.player,
      firstPerson,
      pressed: shown.pressed,
      parryOpen: fight.parryOpen,
      // While a ranged weapon aims, and whenever one is drawn in first person; a bow's draw rings it.
      crosshair:
        shown.aiming || (shown.ranged && firstPerson)
          ? { charge: drawing ? Math.min(1, ownView.action.elapsed / FIGHT_TICKS.drawFull) : null }
          : null,
    };
    return { shot, figures, standing: this.standing, marks, fight: fought };
  }

  /** Every other player's figure, gliding toward where the room last saw them and flashing as it is struck. */
  private otherCards(eyeX: number, eyeY: number, clock: number, frameTicks: number): CardAt[] {
    const { forge } = this.context;
    const { fight, effects, otherGlides } = this;
    const cards: CardAt[] = [];
    for (const [number, placed] of this.otherPlayers.placed) {
      const seen = fight.others.get(number)?.body;
      if (seen)
        [placed.x, placed.y, placed.z] = otherGlides.follow(
          number,
          [seen.x, seen.y, seen.z],
          fight.roomTick,
          frameTicks,
        );
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eyeX, eyeY);
      const frames = forge.frames(placed.dress.body, placed.anim);
      const frame = placed.frame === null ? frameAt(clock, frames, OTHERS_FPS) : Math.min(placed.frame, frames - 1);
      const card = forge.card(placed.id, placed.dress, placed.anim, view, frame, flip);
      const flash = { share: effects.flashes.shareOf(number), red: false };
      if (card) cards.push({ card, ...cardStand(placed.x, placed.y, eyeX, eyeY), z: placed.z, flip, flash });
    }
    otherGlides.keep(new Set(this.otherPlayers.placed.keys()));
    return cards;
  }

  /** Where the player stands with the section's edge, as the room said. */
  get standing(): Standing {
    const standing = this.fight.standing;
    if (standing.kind === 'inside') return standingOf('inside', 0);
    return standingOf(standing.kind, standing.ticks);
  }

  /** Asks the room to stand the player again at the section's spawn nearest where they died, once it offers it. */
  respawn(): void {
    this.fight.askRespawn();
  }

  /** Leaves the node: its room lets the player go, and every other player's figure is taken away. */
  leave(): void {
    if (this.link instanceof RoomConnection) this.link.close();
    this.otherPlayers.clear();
  }
}
