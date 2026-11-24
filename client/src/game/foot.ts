import { QUIET, pushedIn, showAnimaEdge } from '../combat/animaMoment.ts';
import { Arrivals } from '../combat/arrivals.ts';
import { AttackFeel, type DrawnFigure } from '../combat/attackFeel.ts';
import { DropsShown } from '../combat/drops.ts';
import { litMarksSeen, marksHidden, marksSeen } from '../combat/marksOver.ts';
import { FightEffects } from '../combat/fightEffects.ts';
import { Fighting } from '../combat/fighting.ts';
import { FoeFigures } from '../combat/foeFigures.ts';
import { PlayerFight } from '../combat/playerFight.ts';
import type { Vector } from '../combat/swingArcs.ts';
import { figureMuzzle, screenMuzzle } from '../combat/tracers.ts';
import { WorldSounds } from '../combat/worldSounds.ts';
import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { ASKS, DROPPED, type GearState } from '../network/gearMessages.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../network/roomConnection.ts';
import type { CardAt } from '../player/cards.ts';
import { crosshairPoint, shotBodies } from '../player/crosshair.ts';
import type { Placed } from '../player/figures.ts';
import { Glides } from '../player/glide.ts';
import { IDLE, type InputFrame } from '../player/input.ts';
import { cameraFollowed, playerCamera, shownBody } from '../player/player.ts';
import { AIM, handsZoom } from '../player/playerCamera.ts';
import type { PlacedLoop } from '../player/playerMoves.ts';
import type { OtherPlayers, Others } from '../player/others.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import { crosshairOf } from '../combat/reticle.ts';
import { type FighterView, fighterView } from '../rules/fighters.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import type { FoeType } from '../rules/roster.ts';
import { WORLD_CLOCK } from '../sky/worldClock.ts';
import { shotOfOrbit } from './camera.ts';
import { FallWatch } from './fallWatch.ts';
import { STORY_BEHIND_ON_FOOT, type Use, dropsLaid, gearInRoom, questRings, tellsPrologue } from './footGear.ts';
import { GatherHold } from './gatherHold.ts';
import { markedHere } from './overheadMarks.ts';
import { nodeText, standOn } from './footGround.ts';
import { ACCOUNT_CHANGED, type GearHere } from './gearScreen.ts';
import { keysShown, onFoot } from './hints.ts';
import { type Standing, standingOf } from './hudLaw.ts';
import { windowRect } from './nodes.ts';
import { PlazaLife, countersOf, floorOver } from './plazaLife.ts';
import { PublicView } from './publicView.ts';
import { openNodeAlone } from './footNode.ts';
import { nodeRoom } from './rooms.ts';
import {
  dungeonPlace,
  heardRun,
  type InDungeon,
  openAlone,
  roomNameAt,
  standInDungeon,
  unheard,
  useOnFoot,
} from './footTrips.ts';
import { cacheOf } from './dungeonChest.ts';
import { ceilingAt, type DungeonAsk, type DungeonLayout, openAt, seenBlocks } from './dungeonLayout.ts';
import { worldOutput } from './uiSounds.ts';
import type { UsePrompt } from './usePrompt.ts';
import { type Dressed, dressInGear, figureWhere, figuresEye, otherCards, ownCard, strikersOf } from './footFigures.ts';
import type { AtEntrance, FootAsk, FootContext, FootFight, FootFrame, Heard, Held, Opened, Uses } from './footPlace.ts';
import { closedIfThrown, stand } from './footPlace.ts';
import { hearing, nextOtherId, roomNote, rulesOf } from './footRoom.ts';

export type { AtEntrance, FootContext, FootFight, FootFrame, Uses } from './footPlace.ts';
import type { NodeInfo } from './worldData.ts';

/** The lens on foot: the Test Ground's field of view, near enough for the first person's eye, far to the haze. */
const LENS = { fov: FIELD_OF_VIEW, near: 0.1, far: 60_000 } as const;
/** How far over the ground the third-person camera is held. */
const CAMERA_CLEARANCE_M = 0.3;

/**
 * The player on foot in one node: standing on its real ground, among its city's walls, inside its section, fighting
 * whatever foes its room holds as the Test Ground fights. The node's room is the authority: alone, the room crate runs
 * in the rooms' worker on the same ground; online, the server's. It judges the edge and the fight, and the page
 * predicts the player by its own rules and takes its word; every other player and foe is shown where it last saw
 * them. Online, the room keeps the player's gear, which their figure wears; a mark stands over what E uses within
 * reach: a station's keeper, Shape or a dungeon's entrance. A social space's keepers and townsfolk walk it. In a
 * patrol, E at an entrance's door goes into its dungeon; in a dungeon, its floor is the ground, and E at its exit door
 * goes out.
 */
export class Foot {
  readonly node: NodeInfo;
  readonly boxes: readonly Block[];
  /** The dungeon the player plays in, or null on a node's land. */
  readonly dungeon: InDungeon | null;
  /** The patrol's node file's text, which a room alone opens its dungeons from. */
  readonly text: string;
  /** The seas of the room the player joined, which a trip into or out of its dungeons keeps. */
  readonly seas: Difficulty;
  /** The ground's height under a world point as drawn: the land's, or a dungeon's floor. */
  readonly groundAt: (x: number, y: number) => number | null;
  /** The floor a placed figure stands on: in a social space on a pier, a podium or a landing (`floorOver`). */
  readonly floor: (x: number, y: number) => number;
  /** The ceiling over a world point in a dungeon, which the camera stays under; none on a node's land. */
  private readonly roof: ((x: number, y: number) => number | null) | null;
  private readonly module: WebAssembly.Module;
  private readonly context: FootContext;
  private readonly link: RoomLink;
  readonly fight: Fighting;
  private readonly player: PlayerFight;
  private readonly steps: MovementRules;
  readonly otherPlayers: OtherPlayers;
  private readonly otherGlides = new Glides();
  private readonly folkLoops = new WeakMap<Placed, PlacedLoop>();
  private readonly foes: FoeFigures;
  private readonly effects = new FightEffects();
  /** The attack feel as made: the blows' arcs, hit-stops, the camera's kick and the lunge. */
  private readonly feel: AttackFeel;
  private readonly drops = new DropsShown();
  private readonly sounds = new WorldSounds(worldOutput);
  /** The player's fall in a social space, once the room says they fell: the held shot, the tumble, its sounds. */
  private readonly falling = new FallWatch();
  private readonly arrivals = new Arrivals();
  /** The player arrives as the veil lifts on the place: their figure builds and their view blinks open. */
  readonly arrive = (clock: number): void => this.arrivals.arriveHere(this.fight.player, clock);
  /** What the room last said of the player's gear and the place, and the gear the figure was last dressed in. */
  readonly held: Held;
  private readonly dressed: Dressed = { gear: null, loadout: 0 };
  /** The last word on the gear the room was told the prologue is done for. */
  private prologueTold: GearState | null = null;
  /** A social space's people, and what E does where the player stands, shown low in the middle of the view. */
  private readonly plaza: PlazaLife | null;
  readonly folk: Placed[];
  private readonly prompt: UsePrompt;
  private using: Use | null = null;
  /** The player's own figure as last drawn; null while it is not. */
  ownFigure: CardAt | null = null;
  /** The zone's public events as the page plays them. */
  private readonly publicView: PublicView;
  /** A node being gathered while E is held. */
  readonly hold = new GatherHold(
    () => this.gear?.ask({ kind: ASKS.stopGather }),
    () => ({
      at: [this.context.walker.player.body.x, this.context.walker.player.body.y],
      health: this.fight.own?.health ?? 0,
    }),
  );
  /** What E does on a sea island where the player stands: a wreck scavenged, the dungeon's door. */
  private uses: Uses | null = null;

  private constructor(
    context: FootContext,
    node: NodeInfo,
    opened: Opened,
    parts: { link: RoomLink; fight: Fighting; combat: CombatRules; roster: readonly FoeType[] },
    people: { otherPlayers: OtherPlayers; held: Held; folk: Placed[]; module: WebAssembly.Module },
  ) {
    this.context = context;
    this.node = node;
    [this.boxes, this.text, this.dungeon, this.seas] = [opened.boxes, opened.text, opened.dungeon, opened.seas];
    this.module = people.module;
    people.held.entrances.namesFrom(people.module, node);
    const layout = opened.dungeon?.layout;
    this.groundAt = layout
      ? (x, y) => (openAt(layout, Math.floor(x / layout.cell), Math.floor(y / layout.cell)) ? 0 : null)
      : context.groundAt;
    this.roof = layout ? (x, y) => ceilingAt(layout, x, y) : null;
    this.link = parts.link;
    this.fight = parts.fight;
    this.player = new PlayerFight(parts.fight, parts.combat, context.walker);
    this.steps = parts.fight.steps(context.movement);
    [this.otherPlayers, this.held, this.folk] = [people.otherPlayers, people.held, people.folk];
    this.foes = new FoeFigures(parts.roster);
    this.feel = new AttackFeel(parts.combat, context.movement.tickSeconds);
    this.prompt = context.usePrompt;
    this.floor = floorOver(node.kind === 'social' ? opened.boxes : [], (x, y) => context.movement.standing(x, y).z);
    const placing: Others = {
      place: (dress, x, y, facing) => {
        const one = { id: nextOtherId(), x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
        this.folk.push(one);
        return one;
      },
      remove: (one) => {
        this.folk.splice(this.folk.indexOf(one) >>> 0, 1);
        context.forge.forget(one.id);
      },
    };
    this.plaza = node.kind === 'social' ? new PlazaLife(node, placing, this.floor) : null;
    this.publicView = new PublicView(node.id, this.feel, {
      boxes: opened.boxes,
      courses: [context.movement, parts.combat],
    });
    addEventListener(ACCOUNT_CHANGED, this.renamed);
  }

  /** A username taken while here reaches the room, so the player's plate shows it. */
  private readonly renamed = () => this.link.named?.();

  /** Lands the player in a node at its first spawn, facing `facing`, or before the door of the entrance `arriving`
   *  names, keeping how they hold the camera, and joins its room: online the server's at the voyage's `seas`, signed
   *  in with the session's token; alone one in the rooms' worker that may stand the foes asked for. */
  static async enter(
    context: FootContext,
    node: NodeInfo,
    facing: number,
    seas: Difficulty = 'normal',
    arriving?: AtEntrance,
  ): Promise<Foot> {
    const rules = await rulesOf(context);
    const module = await context.roomModule;
    let rect = windowRect(node.ring);
    let { boxes, ground } = await standOn(context, rules.combat, rect);
    const [x, y] = arriving ? [arriving.x, arriving.y] : (node.spawns[0] ?? node.centre);
    stand(context, x, y, arriving?.facing ?? facing, node.kind === 'social');
    const address =
      context.rooms && `${context.rooms(nodeRoom(node, seas))}${arriving ? `?entrance=${arriving.number}` : ''}`;
    return Foot.start(context, node, rules, async (heard, session) => {
      const connection = address ? await RoomConnection.open(address, heard.snapshot, heard.gear, session) : null;
      // The room names the rect its window was cut to; a room baked from older edits is stood on as it stands.
      const bounds = connection?.node?.bounds;
      const work = async () => {
        if (bounds && bounds.some((value, index) => Math.abs(value - (rect[index] ?? 0)) > 0.5)) {
          rect = [bounds[0] ?? 0, bounds[1] ?? 0, bounds[2] ?? 0, bounds[3] ?? 0];
          ({ boxes, ground } = await standOn(context, rules.combat, rect));
        }
        const text = nodeText(node, rect, ground, boxes, await context.land.grounds(node.id));
        const link = connection ?? (await openNodeAlone(module, node, text, heard, arriving?.number, seas));
        return { link, boxes, text, dungeon: null, seas };
      };
      return connection ? closedIfThrown(connection, work) : work();
    });
  }

  /** Takes the player into the dungeon `into` names (its number among the entrances of the place `outside`, whose node
   *  file's text a room alone opens it from, the ask it is laid by and its room's name), at its way in, and joins its
   *  room: online the server's, alone one in the rooms' worker. */
  static async enterDungeon(
    context: FootContext,
    outside: { readonly node: NodeInfo; readonly text: string },
    into: { readonly number: number; readonly ask: DungeonAsk; readonly room: string },
    layout: DungeonLayout,
    seas: Difficulty = 'normal',
  ): Promise<Foot> {
    const rules = await rulesOf(context);
    const module = await context.roomModule;
    standInDungeon(context.movement, rules.combat, into.ask);
    stand(context, layout.arrival.x, layout.arrival.y, layout.arrival.bearing, false);
    const address = context.rooms?.(into.room);
    const dungeon = { patrol: outside.node, ...into, layout };
    return Foot.start(context, dungeonPlace(outside.node, layout), rules, async (heard, session) => ({
      link: address
        ? await RoomConnection.open(address, heard.snapshot, heard.gear, session)
        : await openAlone(module, outside.text, into, heard, seas),
      boxes: seenBlocks(layout),
      text: outside.text,
      dungeon,
      seas,
    }));
  }

  /** Joins the room `open` opens, handing it what the page hears of it, and stands the fight on it. */
  private static async start(
    context: FootContext,
    node: NodeInfo,
    rules: { combat: CombatRules; roster: readonly FoeType[] },
    open: (heard: Heard, session: string | null) => Promise<Opened>,
  ): Promise<Foot> {
    const { players, heard: hearer, received } = hearing(context.forge);
    const held: Held = { gear: null, alone: null, ...unheard() };
    const online = context.rooms !== null;
    const asked = online ? [] : context.foesAsked;
    const heard: Heard = {
      snapshot: (snapshot: Snapshot) => {
        received(snapshot);
        held.cache = cacheOf(snapshot.cache);
        heardRun(held, snapshot, hearer.fight?.player ?? null);
      },
      // Offline the room's word on the gear tells of the patrol's entrances and the chests; the figure keeps its dress.
      gear: (sent: GearState) => {
        if (online) held.gear = sent;
        else held.alone = sent;
        held.entrances.heard(sent.dungeons);
      },
      asks: asked.length > 0,
    };
    const opened = await open(heard, await context.session());
    return closedIfThrown(opened.link, async () => {
      const fight = new Fighting(rules.combat, opened.link);
      hearer.fight = fight;
      if (!opened.dungeon) for (const foe of asked) fight.ask(foe);
      // The welcome's dresses and plates come with the first snapshot after it (`RoomConnection`), so none newer is
      // undone by the welcome taken late.
      const people = { otherPlayers: players, held, folk: [], module: await context.roomModule };
      return new Foot(context, node, opened, { link: opened.link, fight, ...rules }, people);
    });
  }

  /** The player on a grid of heights with no ground of the land: boarding a struck ship, on `node` its deck in its own
   *  frame (`deckFloats`) at the spot its deck room stands a boarder, facing its bow; or landed on a sea island, its
   *  ground and its modules' boxes in the world's metres, facing inland, E using what lies near (`place`). The room
   *  is reached through the link `open` makes, which hands on each of its snapshots. */
  static async onDeck(
    context: FootContext,
    node: NodeInfo,
    grid: readonly number[],
    open: (received: (snapshot: Snapshot) => void) => RoomLink,
    place: {
      readonly boxes?: readonly Block[];
      readonly facing?: number;
      readonly uses?: Uses;
      readonly gear?: { gear: GearState | null };
    } = {},
  ): Promise<Foot> {
    const { movement } = context;
    const rules = await rulesOf(context);
    const boxes = place.boxes ?? [];
    movement.setCourse(boxes);
    rules.combat.setCourse(boxes);
    if (!movement.setHeights(grid) || !rules.combat.setHeights(grid)) throw new Error('the ground did not load');
    const [x, y] = node.spawns[0] ?? node.centre;
    stand(context, x, y, place.facing ?? 0, false);
    const { players, heard, received } = hearing(context.forge);
    const link = open(received);
    const fight = new Fighting(rules.combat, link);
    heard.fight = fight;
    players.take(link);
    // The place's own holder of the gear, which its room's word fills, is the one the figure is dressed from.
    const held: Held = Object.assign(place.gear ?? { gear: null }, { alone: null }, unheard());
    const opened: Opened = { link, boxes, text: '', dungeon: null, seas: 'normal' };
    const people = { otherPlayers: players, held, folk: [], module: await context.roomModule };
    const foot = new Foot(context, node, opened, { link, fight, ...rules }, people);
    foot.uses = place.uses ?? null;
    return foot;
  }

  /** Tells the room the story is behind the player, once for each word on the gear that says it is not kept. */
  private tellPrologue(): void {
    const gear = this.held.gear;
    if (!tellsPrologue(gear, STORY_BEHIND_ON_FOOT, this.prologueTold)) return;
    this.prologueTold = gear;
    this.gear?.ask({ kind: ASKS.finishPrologue });
  }

  /** The player's gear in their room, and the way to ask of it (`gearInRoom`). */
  get gear(): GearHere | null {
    const { forge, walker } = this.context;
    return gearInRoom(this.link, this.held.gear, (ask) => this.fight.askGear(ask), { forge, dress: walker.you.dress });
  }

  /** Whether the player has fallen and waits to respawn. */
  get fallen(): boolean {
    return this.standing.kind === 'dead' || this.fight.own?.action.kind === 'dead';
  }

  /** Does what E does where the player stands, if anything is within reach: at a node, begins to gather it while E is
   *  held. */
  use(): void {
    this.using?.run();
    this.hold.begin(this.using?.gather, this.gear?.gear ?? null);
  }

  /** The name of the dungeon's room the player stands in, or null in a corridor or on a node's land. */
  get roomName(): string | null {
    return this.dungeon && roomNameAt(this.dungeon.layout, this.context.walker.player.body);
  }

  /** Whether the room's socket closed and the page is joining it again. */
  get rejoining(): boolean {
    return this.link.rejoining;
  }

  /** Why the room's gate shut to the player, in its words; null while it is open, and always alone. */
  get shut(): string | null {
    return this.link.shut ?? null;
  }

  /** A line on the room the player plays in (`roomNote`). */
  get roomNote(): string {
    return roomNote(this.link);
  }

  /** One frame on foot: the player plays and fights (with nothing pressed while `paused`, nor while `looking` at the
   *  held map, though the world is heard as ever; the fight's buttons only while `hands`), the room's clock runs, the
   *  camera follows, and every figure, foe and mark is placed for an eye there. */
  frame(
    controls: InputFrame,
    seconds: number,
    clock: number,
    { paused, looking = false, hands, aspect, eye: cutscene = null }: FootAsk,
  ): FootFrame {
    const still = paused || looking;
    const { walker, movement, forge } = this.context;
    const { groundAt } = this;
    const { fight, foes, effects } = this;
    dressInGear(walker, forge, this.held.gear, this.dressed);
    this.tellPrologue();
    this.plaza?.frame(WORLD_CLOCK.seconds(), this.gear?.gear ?? null);
    const near = [...foes.placed.values(), ...this.otherPlayers.placed.values()];
    const bodies = near.map((placed) => [placed.x, placed.y, placed.z] as const);
    const { feel } = this;
    // The tumble starts the way the figure was last drawn facing (the aim, while aiming).
    walker.fall = this.falling.figure(fight.standing, walker.player.body, walker.you.facing);
    const blocks = [...this.boxes, ...(this.context.cameraBlocks ?? [])];
    const aimed = () => playerCamera(walker.player, movement, blocks, AIM, groundAt, this.roof);
    const camera = () => pushedIn(aimed(), effects.anima.push);
    const shown = this.player.frame(still ? IDLE : { ...controls, locked: true }, this.steps, seconds, clock, {
      running: true,
      hands: hands && !still,
      markOf: () => crosshairPoint(camera(), aspect, this.boxes, shotBodies(foes.placed, fight.foes), groundAt),
      zoomOf: () => handsZoom(camera(), walker.player.view),
      handsSeconds: feel.shownSeconds(fight.player, seconds),
    });
    walker.player = cameraFollowed(walker.player, movement, this.boxes, groundAt, seconds);
    effects.ownLook = walker.glowing[0];
    const events = effects.events(fight, seconds, (id, look) => foes.dissolveFoe(id, look, clock));
    this.arrivals.told(events, clock);
    const publicEvents = fight.takePublicEvents();
    const ownWeapon = effects.flashes.ownOf(fight.own);
    walker.fought(ownWeapon.surge, ownWeapon.contact);
    feel.frame(events, fight.own, fight.player, seconds, new Set(fight.others.keys()));
    const firstPerson = walker.inFirstPerson;
    // The crosshair shows while a ranged weapon aims, and whenever the Ranged loadout is drawn in first person (a bow's
    // draw rings it); while it shows, the kick moves the view but never turns it, so it stays where shots land.
    const sights = shown.aiming || (shown.rangedDrawn && firstPerson);
    const kicked = pushedIn(feel.camera(aimed(), fight.player, fight.own, firstPerson, sights), effects.anima.push);
    const { x: fallX, y: fallY, z: fallZ } = walker.player.body;
    const shot = this.falling.shot(
      shotOfOrbit(kicked, LENS, groundAt, CAMERA_CLEARANCE_M),
      [fallX, fallY, fallZ],
      seconds,
    );
    const eye = figuresEye(cutscene, shot.eye, firstPerson);
    const { x: eyeX, y: eyeY, nearest } = eye;
    const frameTicks = seconds / movement.tickSeconds;
    // Each figure drawn off where it stands by the attack feel, and kept as drawn, which its blow's arc follows.
    const shift = (id: number, view: FighterView | null): Vector => feel.shift(id, view, shot.yaw);
    const right = [Math.cos(shot.yaw), Math.sin(shot.yaw)] as const;
    const smear = (id: number) => feel.smearOf(id, right);
    const drawnAt = new Map<number, DrawnFigure>();
    const otherViews = new Map<number, FighterView>();
    for (const [number, seen] of fight.others) if (seen.fighter) otherViews.set(number, fighterView(seen.fighter));
    const figures: CardAt[] = [];
    const body = shownBody(walker.player);
    const arrival = this.arrivals.ownShareOf(fight.player, clock);
    this.ownFigure = ownCard(walker, fight, effects.flashes, arrival, eye, { shift, smear, drawnAt });
    if (this.ownFigure) figures.push(this.ownFigure);
    const { tickSeconds } = movement;
    const { otherPlayers, otherGlides, folk, folkLoops, arrivals } = this;
    const people = { forge, fight, effects, otherPlayers, otherGlides, folk, folkLoops, tickSeconds, arrivals };
    figures.push(...otherCards(people, [eyeX, eyeY], clock, frameTicks, { shift, drawnAt, otherViews, nearest }));
    const foeFeel = { held: (id: number, view: FighterView) => feel.held(id, view), shift, drawn: drawnAt, smear };
    figures.push(...foes.cards(fight, forge, eye, clock, frameTicks, tickSeconds, effects.flashes, foeFeel));
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's along its shot.
    const [muzzle, gearNow, floor, doors] = [walker.muzzle, this.gear?.gear ?? null, this.floor, this.held.entrances];
    const { trips, speak } = this.context;
    const marked = markedHere(gearNow, countersOf(this.node), floor, trips.props(), speak, doors.entrances);
    const lit = litMarksSeen(marked, shot.eye, clock);
    const hidden = marksHidden(marked, shot.eye, clock);
    const laid = (gearNow?.drops ?? []).filter((drop) => drop.kind !== DROPPED.chest);
    const dropped = dropsLaid(this.drops, laid, clock, shot.eye, [
      ...questRings(gearNow, floor, clock),
      ...marksSeen(marked, shot.eye, clock),
      ...foes.overheads(shot.eye, clock),
    ]);
    // A public event's chest is drawn as a prop of its own, online or alone.
    const chests = (this.held.gear ?? this.held.alone)?.drops.filter((drop) => drop.kind === DROPPED.chest) ?? [];
    const ownView = fight.own;
    const where = figureWhere(fight, foes.placed, this.otherPlayers.placed);
    const [feet, others] = [[body.x, body.y, body.z] as const, this.otherPlayers.placed];
    const seen = { player: fight.player, shot, firstPerson, feet, yaw: walker.player.facing, where, others };
    const shownPublic = this.publicView.frame(fight.public, publicEvents, chests, seen, clock, dropped.marks, floor, {
      quiet: paused,
      held: fight.publicHeld,
      encounter: { layout: this.dungeon?.layout, seen: this.held.encounter },
    });
    const marks = effects.marks(fight, seconds, {
      eye: shot.eye,
      blocks: this.boxes,
      bodies,
      muzzleOf: () =>
        muzzle ? screenMuzzle(kicked, aspect, muzzle) : figureMuzzle([body.x, body.y, body.z], walker.you.facing),
      origin: shot.eye,
      groundAt,
      drawn: { foes: foes.placed, others: this.otherPlayers.placed },
      more: dropped.marks,
      rider: { feet, facing: walker.player.facing, mounted: walker.player.mounted, boosting: body.boosting ?? 0 },
    });
    this.sounds.frame({
      seconds,
      quiet: paused,
      fight,
      events,
      shots: effects.shotsHeard,
      eye: shot.eye,
      yaw: shot.yaw,
      walker: {
        feet: [body.x, body.y, body.z],
        walked: walker.walked,
        drawn: walker.you.dress.outfit.drawn,
        mounted: walker.player.mounted,
        boosting: walker.player.body.boosting ?? 0,
        look: effects.ownLook,
        pulled: shown.pulled,
      },
      others: this.otherPlayers.placed,
      foes: foes.placed,
      ground: { blocks: this.boxes, groundAt },
      landed: dropped.landed,
      crates: this.held.gear?.crates ?? null,
      heard: shownPublic.sounds,
    });
    const { fall } = walker;
    const playerFall = { id: fight.player, feet: [body.x, body.y, body.z] as const, tumbling: !!fall?.tumbling };
    const heard = { ...playerFall, lying: fall?.tumbling === false };
    this.falling.hear(heard, fight.others, this.otherPlayers.placed, { seconds, eye: shot.eye, quiet: paused });
    // Every blow being struck, its arc following its striker's figure as drawn; none through the eyes.
    const yours = { dress: walker.shownDress, looks: walker.glowing };
    const strikers = strikersOf(fight, yours, foes, otherViews, this.otherPlayers.placed);
    // The arcs are measured from the eye, as the marks are, so they keep their centimetres far out in the world.
    const swings = feel.arcsMesh(clock, strikers, drawnAt, shot.eye, firstPerson, shot.eye);
    showAnimaEdge(effects.anima);
    // E does nothing while a menu or the held map is up, or the player lies dead, past the edge or felled by a foe.
    const able = !still && !this.fallen;
    const gear = this.gear;
    const { x, y } = walker.player.body;
    const here = {
      dungeon: this.dungeon,
      portalOpen: this.held.cache?.open ?? false,
      patrol: this.node,
      entrances: this.held.entrances,
      module: this.module,
    };
    const placeUse = this.uses?.(x, y, (asked) => fight.askGear(asked)) ?? null;
    const { mounted } = walker.player;
    const counters = countersOf(this.node);
    const chest = this.publicView.use(chests, feet, (asked) => fight.askGear(asked), clock);
    this.using = able ? (chest ?? useOnFoot(x, y, placeUse, counters, gear, here, trips, speak, mounted)) : null;
    // Use let go, as bound (a key, the pad's button, or the page's focus lost): a gather under way is let go of.
    if (!controls.held('use')) this.hold.release();
    this.prompt.show(this.using?.words ?? null, this.hold.share(clock, able && !mounted, gear?.gear ?? null));
    const held = gear?.gear;
    // The room leaves an Ammo box lying while the ammunition is full, whether a Ranged weapon is worn or not.
    const full = (held?.ammoShare ?? 1) >= 1;
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
      parryWindow: fight.parryWindow,
      abilities: fight.abilities,
      rider: walker.player.mounted ? walker.player.body : null,
      // The shots left stand beside the crosshair, wherever it shows.
      ammo: sights ? (ownView?.ammo ?? null) : null,
      ammoMost: held?.ammoMost ?? null,
      ammoFull: !!ownView && this.drops.ammoFull(held?.drops ?? [], [ownView.x, ownView.y, ownView.z], full),
      crosshair: crosshairOf(shown.reticle, sights, ownView, fight.reach),
      arms: {
        gear: this.gear?.gear ?? null,
        loadout: walker.player.loadout,
        drawn: walker.you.dress.outfit.drawn,
        dress: walker.you.dress,
      },
      public: shownPublic.shown,
    };
    const standing = this.standing;
    const hints = keysShown(standing, onFoot(walker, shown, fight, !controls.locked && !paused));
    const dark = arrivals.darkOf(fight.player, clock);
    const { props, quest, sting } = shownPublic;
    return { shot, figures, standing, marks, lit, hidden, swings, fight: fought, hints, dark, props, quest, sting };
  }

  /** Where the player stands with the section's edge, as the room said. */
  get standing(): Standing {
    const standing = this.fight.standing;
    if (standing.kind === 'inside') return standingOf('inside', 0);
    const byFall = standing.kind === 'dead' && standing.fell;
    return standingOf(standing.kind, standing.ticks, byFall, this.falling.told(byFall));
  }

  /** Asks the room to stand the player again at the section's spawn nearest where they died, while it offers it. */
  respawn(): void {
    const { standing } = this;
    if (standing.kind === 'dead' && standing.canRespawn) this.fight.askRespawn();
  }

  /** Leaves the node: its room lets the player go, and every other player's figure and its people are taken away. */
  leave(): void {
    removeEventListener(ACCOUNT_CHANGED, this.renamed);
    // The gather's stop is asked while the link still holds.
    this.hold.release();
    this.link.close?.();
    this.otherPlayers.clear();
    this.foes.forget(this.context.forge);
    this.arrivals.clear();
    this.plaza?.close();
    this.prompt.show(null);
    this.falling.close();
    // The figure stands again wherever the walker goes next, at sea as on foot.
    this.context.walker.fall = null;
    // An Anima's edge frame cast just before leaving must not stay over the next place.
    showAnimaEdge(QUIET);
  }
}
