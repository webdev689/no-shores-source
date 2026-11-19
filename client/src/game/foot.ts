import { QUIET, pushedIn, showAnimaEdge } from '../combat/animaMoment.ts';
import { AttackFeel, type DrawnFigure } from '../combat/attackFeel.ts';
import { DropsShown } from '../combat/drops.ts';
import { FightEffects } from '../combat/fightEffects.ts';
import { Fighting } from '../combat/fighting.ts';
import { FoeFigures } from '../combat/foeFigures.ts';
import type { HudFrame } from '../combat/hud.ts';
import { PlayerFight } from '../combat/playerFight.ts';
import { castLookOf, veiledIn } from '../combat/spellLooks.ts';
import type { Vector } from '../combat/swingArcs.ts';
import { figureMuzzle, screenMuzzle } from '../combat/tracers.ts';
import { WorldSounds } from '../combat/worldSounds.ts';
import { FIELD_OF_VIEW } from '../editor/orbit.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { GearState } from '../network/gearMessages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { RoomConnection, type RoomLink, type Snapshot } from '../network/roomConnection.ts';
import type { CardAt } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { crosshairPoint } from '../player/crosshair.ts';
import { cardStand, frameAt, type Placed, viewOf } from '../player/figures.ts';
import { heldElements } from '../player/gear.ts';
import { gearOutfit } from '../player/gearLooks.ts';
import { Glides } from '../player/glide.ts';
import type { InputFrame } from '../player/input.ts';
import { playerCamera, shownBody } from '../player/player.ts';
import { OtherPlayers, type Others } from '../player/others.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import { FIGHT_TICKS } from '../player/fightMoves.ts';
import { type FighterView, fighterView } from '../rules/fighters.ts';
import type { Block, MovementRules } from '../rules/movementRules.ts';
import type { FoeType } from '../rules/roster.ts';
import { type Shot, shotOfOrbit } from './camera.ts';
import { type Use, groundRings, useAt } from './footGear.ts';
import type { GearHere } from './gearScreen.ts';
import { HINTS, footHints } from './hints.ts';
import { type Standing, standingOf } from './hudLaw.ts';
import { windowRect } from './nodes.ts';
import { PlazaLife } from './plazaLife.ts';
import { dungeonRoom, nodeRoom } from './rooms.ts';
import { dungeonPlace, Entrances, type InDungeon, standInDungeon, tripAt } from './footTrips.ts';
import { cacheOf } from './dungeonChest.ts';
import { type DungeonLayout, openAt, seenBlocks } from './dungeonLayout.ts';
import { chime, worldOutput } from './uiSounds.ts';
import { UsePrompt } from './usePrompt.ts';
import {
  type AtEntrance,
  type FootContext,
  type Heard,
  type Held,
  nodeText,
  type Opened,
  rulesOf,
  stand,
  standOn,
} from './footPlace.ts';

export type { AtEntrance, FootContext } from './footPlace.ts';
import type { NodeInfo } from './worldData.ts';

/** The lens on foot: the Test Ground's field of view, near enough for the first person's eye, far to the haze. */
const LENS = { fov: FIELD_OF_VIEW, near: 0.1, far: 60_000 } as const;
/** How far over the ground the third-person camera is held. */
const CAMERA_CLEARANCE_M = 0.3;
/** Other players' figures loop a move at this many frames a second where their screen gave no frame. */
const OTHERS_FPS = 6;
/** How far apart in time two figures' steps are, by their numbers, in seconds: a crowd never walks in step. */
const STRIDE_APART_S = 0.37;
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

/** What the fight's display is drawn from on foot, but the camera, the canvas and a lost room (the game's own line
 *  tells of that). */
export type FootFight = Omit<HudFrame, 'matrix' | 'width' | 'height' | 'lost'>;

/** What one frame on foot shows: the shot, every figure, where the player stands with the section's edge, the
 *  fight (its marks on the ground and in the air, measured from the eye, with the gear's rings and beams; the arcs
 *  of its blows, in world metres; and what its display shows), and the keys listed. */
export interface FootFrame {
  readonly shot: Shot;
  readonly figures: readonly CardAt[];
  readonly standing: Standing;
  readonly marks: Float32Array;
  readonly swings: Float32Array;
  readonly fight: FootFight;
  readonly hints: readonly string[];
}

/**
 * The player on foot in one node: standing on its real ground, among its city's walls, inside its section, fighting
 * whatever foes its room holds as the Test Ground fights. The node's room is the authority: alone, the room crate runs
 * in the page on the same ground; online, the server's. It judges the edge and the fight, and the page predicts the
 * player by its own rules and takes its word; every other player and foe is shown where it last saw them. Online, the
 * room keeps the player's gear, which their figure wears; its rings mark what E uses within reach: a station's counter
 * or a resource node. A social space's keepers and townsfolk walk it. In a patrol, E at an entrance's door goes into
 * its dungeon; in a dungeon, its floor is the ground, and E at its exit door goes out.
 */
export class Foot {
  readonly node: NodeInfo;
  readonly boxes: readonly Block[];
  /** The dungeon the player plays in, or null on a node's land. */
  readonly dungeon: InDungeon | null;
  /** The patrol's node file's text, which a room alone opens its dungeons from. */
  readonly text: string;
  /** The ground's height under a world point as drawn: the land's, or a dungeon's floor. */
  readonly groundAt: (x: number, y: number) => number | null;
  private readonly module: WebAssembly.Module;
  private readonly context: FootContext;
  private readonly link: RoomLink;
  readonly fight: Fighting;
  private readonly player: PlayerFight;
  private readonly steps: MovementRules;
  private readonly otherPlayers: OtherPlayers;
  private readonly otherGlides = new Glides();
  private readonly foes: FoeFigures;
  private readonly effects = new FightEffects();
  /** The attack feel as made: the blows' arcs, hit-stops, the camera's kick and the lunge. */
  private readonly feel: AttackFeel;
  private readonly drops = new DropsShown();
  private readonly sounds = new WorldSounds(worldOutput);
  /** The link's welcomes followed: one more means the player joined the room again. */
  private joined = 1;
  /** What the room last said of the player's gear and the place, and the gear the figure was last dressed in. */
  readonly held: Held;
  private dressedIn: GearState | null = null;
  private dressedLoadout = 0;
  /** A social space's people, and what E does where the player stands, shown low in the middle of the view. */
  private readonly plaza: PlazaLife | null;
  private readonly folk: Placed[];
  private readonly prompt: UsePrompt | null;
  private using: Use | null = null;

  private constructor(
    context: FootContext,
    node: NodeInfo,
    opened: Opened,
    parts: { link: RoomLink; fight: Fighting; combat: CombatRules; roster: readonly FoeType[] },
    people: { otherPlayers: OtherPlayers; held: Held; folk: Placed[]; module: WebAssembly.Module },
  ) {
    this.context = context;
    this.node = node;
    [this.boxes, this.text, this.dungeon, this.module] = [opened.boxes, opened.text, opened.dungeon, people.module];
    const layout = opened.dungeon?.layout;
    this.groundAt = layout
      ? (x, y) => (openAt(layout, Math.floor(x / layout.cell), Math.floor(y / layout.cell)) ? 0 : null)
      : context.groundAt;
    this.link = parts.link;
    this.fight = parts.fight;
    this.player = new PlayerFight(parts.fight, parts.combat, context.walker);
    this.steps = parts.fight.steps(context.movement);
    [this.otherPlayers, this.held, this.folk] = [people.otherPlayers, people.held, people.folk];
    this.foes = new FoeFigures(parts.roster);
    this.feel = new AttackFeel(parts.combat, context.movement.tickSeconds);
    const hud = document.querySelector<HTMLElement>('#hud');
    this.prompt = hud ? new UsePrompt(hud) : null;
    const floor = (x: number, y: number) => context.movement.standing(x, y).z;
    const placing: Others = {
      place: (dress, x, y, facing) => {
        const one = { id: nextOtherId++, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
        this.folk.push(one);
        return one;
      },
      remove: (one) => {
        this.folk.splice(this.folk.indexOf(one) >>> 0, 1);
        context.forge.forget(one.id);
      },
    };
    this.plaza = node.kind === 'social' ? new PlazaLife(node, placing, floor) : null;
  }

  /** Lands the player in a node at its first spawn, facing `facing`, or before the door of the entrance `arriving`
   *  names, keeping how they hold the camera, and joins its room: online the server's at the voyage's `seas`, signed
   *  in with the session's token; alone one in the page that may stand the foes the context asks for. */
  static async enter(
    context: FootContext,
    node: NodeInfo,
    facing: number,
    seas: Difficulty = 'calm',
    arriving?: AtEntrance,
  ): Promise<Foot> {
    const { module, rules } = await rulesOf(context);
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
      try {
        if (bounds && bounds.some((value, index) => Math.abs(value - (rect[index] ?? 0)) > 0.5)) {
          rect = [bounds[0] ?? 0, bounds[1] ?? 0, bounds[2] ?? 0, bounds[3] ?? 0];
          ({ boxes, ground } = await standOn(context, rules.combat, rect));
        }
      } catch (error) {
        connection?.close();
        throw error;
      }
      const text = nodeText(node, rect, ground, boxes);
      const local = { gear: heard.gear, entrance: arriving?.number };
      const link = connection ?? LocalRoom.openNode(module, text, heard.snapshot, heard.asks, local);
      return { link, boxes, text, dungeon: null };
    });
  }

  /** Takes the player into dungeon `number` of the patrol `patrol` (its node and its node file's text, which a room
   *  alone opens it from), at its way in, and joins its room: online the server's at `seas`, alone one in the page. */
  static async enterDungeon(
    context: FootContext,
    patrol: { readonly node: NodeInfo; readonly text: string },
    number: number,
    layout: DungeonLayout,
    seas: Difficulty = 'calm',
  ): Promise<Foot> {
    const { module, rules } = await rulesOf(context);
    standInDungeon(context.movement, rules.combat, patrol.node, number);
    stand(context, layout.arrival.x, layout.arrival.y, layout.arrival.bearing, false);
    const address = context.rooms?.(dungeonRoom(patrol.node, seas, number));
    const dungeon = { patrol: patrol.node, number, layout };
    return Foot.start(context, dungeonPlace(patrol.node, layout), rules, async (heard, session) => ({
      link: address
        ? await RoomConnection.open(address, heard.snapshot, heard.gear, session)
        : LocalRoom.openDungeon(module, patrol.text, number, heard.snapshot, heard.gear),
      boxes: seenBlocks(layout),
      text: patrol.text,
      dungeon,
    }));
  }

  /** Joins the room `open` opens, handing it what the page hears of it, and stands the fight on it. */
  private static async start(
    context: FootContext,
    node: NodeInfo,
    rules: { combat: CombatRules; roster: readonly FoeType[] },
    open: (heard: Heard, session: string | null) => Promise<Opened>,
  ): Promise<Foot> {
    const { forge } = context;
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
    const held: Held = { gear: null, entrances: new Entrances(), cache: null };
    const online = context.rooms !== null;
    const asked = online || node.kind === 'dungeon' ? [] : context.foesAsked;
    const heard: Heard = {
      snapshot: (snapshot: Snapshot) => {
        players.takeDresses(snapshot.dressed);
        fight?.receive(snapshot);
        held.cache = cacheOf(snapshot.cache);
        // Before the fight stands there is no own number to tell the player from the others.
        if (fight) players.seen(snapshot.players, fight.player, forge);
      },
      // Offline the room's word on the gear tells only of the patrol's entrances; the figure keeps its own dress.
      gear: (sent: GearState) => {
        if (online) held.gear = sent;
        held.entrances.heard(sent.dungeons);
      },
      asks: asked.length > 0,
    };
    const opened = await open(heard, await context.session);
    fight = new Fighting(rules.combat, opened.link);
    for (const foe of asked) fight.ask(foe);
    // The player starts at the first spawn, where the room stands its first to join; the room's word moves a later
    // one to the spawn its turn gives, which its number does not tell, since the garrison's foes are numbered too.
    players.takeDresses(opened.link.dressed);
    return new Foot(
      context,
      node,
      opened,
      { link: opened.link, fight, ...rules },
      { otherPlayers: players, held, folk: [], module: await context.roomModule },
    );
  }

  /** Dresses the player's figure in their gear as their room last sent it, its hands the loadout drawn, once either
   *  changes, its weapons glowing in their element. */
  private dressInGear(): void {
    const gear = this.held.gear;
    const { walker, forge } = this.context;
    const { loadout } = walker.player;
    if (!gear || (gear === this.dressedIn && loadout === this.dressedLoadout)) return;
    [this.dressedIn, this.dressedLoadout] = [gear, loadout];
    const wardrobe = forge.wardrobe(walker.you.dress.body);
    if (wardrobe) {
      const outfit = gearOutfit(gear, wardrobe, walker.you.dress.outfit, loadout);
      walker.you.dress = { ...walker.you.dress, outfit };
    }
    walker.glow = heldElements(gear, loadout);
  }

  /** The player's gear in their room, and the way to ask of it; null offline or once the room is lost. */
  get gear(): GearHere | null {
    const { link, fight } = this;
    const { forge, walker } = this.context;
    if (!(link instanceof RoomConnection) || !link.open) return null;
    return { gear: this.held.gear, ask: (ask) => fight.askGear(ask), forge, dress: walker.you.dress };
  }

  /** Whether the player has fallen and waits to respawn. */
  get fallen(): boolean {
    return this.standing.kind === 'dead' || this.fight.own?.action.kind === 'dead';
  }

  /** Does what E does where the player stands, if anything is within reach. */
  use(): void {
    this.using?.run();
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
    const { walker, movement, forge } = this.context;
    const { groundAt } = this;
    const { fight, foes, effects } = this;
    this.dressInGear();
    this.plaza?.frame(seconds);
    if (this.link.joins !== this.joined) {
      // A link that joined its room again brings every dress there with its welcome.
      this.joined = this.link.joins;
      this.otherPlayers.takeDresses(this.link.dressed);
    }
    const standing = [...foes.placed.values(), ...this.otherPlayers.placed.values()];
    const bodies = standing.map((placed) => [placed.x, placed.y, placed.z] as const);
    const { feel } = this;
    const aimed = () => playerCamera(walker.player, movement, this.boxes);
    const camera = () => pushedIn(aimed(), effects.anima.push);
    const shown = this.player.frame(paused ? IDLE : { ...controls, locked: true }, this.steps, seconds, clock, {
      running: true,
      hands: hands && !paused,
      markOf: () => crosshairPoint(camera(), aspect, this.boxes, bodies, groundAt),
      zoomOf: () => camera().zoom ?? 1,
      handsSeconds: feel.shownSeconds(fight.player, seconds),
    });
    effects.ownLook = walker.glowing[0];
    const events = effects.events(fight, seconds, (id, look) => foes.dissolveFoe(id, look, clock));
    const ownWeapon = effects.flashes.ownOf(fight.own);
    walker.fought(ownWeapon.surge, ownWeapon.contact);
    feel.frame(events, fight.own, fight.player, seconds, new Set(fight.others.keys()));
    const firstPerson = walker.inFirstPerson;
    // The crosshair shows while a ranged weapon aims, and whenever the Ranged loadout is drawn in first person (a bow's
    // draw rings it); while it shows, the kick moves the view but never turns it, so it stays where shots land.
    const sights = shown.aiming || (shown.rangedDrawn && firstPerson);
    const kicked = pushedIn(feel.camera(aimed(), fight.player, fight.own, firstPerson, sights), effects.anima.push);
    const shot = shotOfOrbit(kicked, LENS, groundAt, CAMERA_CLEARANCE_M);
    const [eyeX, eyeY] = shot.eye;
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
    const ownShift = shift(fight.player, fight.own);
    const own = walker.figure(eyeX, eyeY, effects.flashes.flashOf(fight.player), ownShift);
    const statuses = fight.own?.statuses;
    const [charged, exposed] = [(statuses?.charge ?? 0) > 0, (statuses?.expose ?? 0) > 0];
    if (own) {
      figures.push({ ...own, veiled: veiledIn(fight, fight.player), charged, exposed, smear: smear(fight.player) });
      const feet: Vector = [body.x + ownShift[0], body.y + ownShift[1], body.z + ownShift[2]];
      drawnAt.set(fight.player, { feet, anim: walker.look.anim, flip: own.flip });
    }
    figures.push(...this.otherCards(eyeX, eyeY, clock, frameTicks, { shift, drawnAt, otherViews }));
    const foeFeel = { held: (id: number, view: FighterView) => feel.held(id, view), shift, drawn: drawnAt, smear };
    const { tickSeconds } = movement;
    figures.push(
      ...foes.cards(fight, forge, { x: eyeX, y: eyeY }, clock, frameTicks, tickSeconds, effects.flashes, foeFeel),
    );
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's along its shot.
    const muzzle = walker.muzzle;
    const dropped = this.dropMarks(clock, shot.eye, [
      ...groundRings(this.gear?.gear ?? null, this.node.stations ?? [], (x, y) => movement.standing(x, y).z, clock),
      ...foes.overheads(shot.eye, clock),
    ]);
    const marks = effects.marks(fight, seconds, {
      eye: shot.eye,
      blocks: this.boxes,
      bodies,
      muzzleOf: (fired) =>
        muzzle
          ? screenMuzzle(kicked, aspect, muzzle)
          : figureMuzzle([body.x, body.y, body.z], Math.atan2(fired.velocity[0], -fired.velocity[1])),
      origin: shot.eye,
      groundAt,
      drawn: { foes: foes.placed, others: this.otherPlayers.placed },
      more: dropped.marks,
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
        look: effects.ownLook,
        pulled: shown.pulled,
      },
      others: this.otherPlayers.placed,
      foes: foes.placed,
      ground: { blocks: this.boxes, groundAt },
      landed: dropped.landed,
      crates: this.held.gear?.crates ?? null,
    });
    // Every blow being struck, its arc following its striker's figure as drawn; none through the eyes.
    const handsOf = (dress: Dress | null | undefined) => ({
      right: dress?.outfit.right ?? null,
      left: dress?.outfit.left ?? null,
    });
    const strikers = [
      { id: fight.player, view: fight.own, ...handsOf(walker.you.dress), looks: walker.glowing },
      ...[...fight.foes.values()].map((kept) => ({ id: kept.id, view: kept.view, ...handsOf(foes.dressOf(kept)) })),
      ...[...otherViews].map(([number, view]) => ({
        id: number,
        view,
        ...handsOf(this.otherPlayers.placed.get(number)?.dress),
      })),
    ];
    // The arcs are measured from the eye, as the marks are, so they keep their centimetres far out in the world.
    const swings = feel.arcsMesh(clock, strikers, drawnAt, shot.eye, firstPerson, shot.eye);
    showAnimaEdge(effects.anima);
    // E does nothing while a menu is up or the player lies dead, past the edge or felled by a foe.
    const able = !paused && !this.fallen;
    const gear = this.gear;
    const { x, y } = walker.player.body;
    const here = {
      dungeon: this.dungeon,
      portalOpen: this.held.cache?.open ?? false,
      patrol: this.node,
      entrances: this.held.entrances,
      module: this.module,
    };
    this.using = able
      ? (useAt(x, y, this.node.stations ?? [], gear?.gear ?? null, (asked) => gear?.ask(asked)) ??
        tripAt(x, y, here, this.context.trips))
      : null;
    this.prompt?.show(this.using?.words ?? null);
    const ownView = fight.own;
    const where = (id: number): readonly [number, number, number] | null => {
      if (id === fight.player && ownView) return [ownView.x, ownView.y, ownView.z];
      const figure = foes.placed.get(id) ?? this.otherPlayers.placed.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
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
      abilities: fight.abilities,
      // The shots left stand beside the crosshair, wherever it shows.
      ammo: sights ? (ownView?.ammo ?? null) : null,
      ammoMost: this.gear?.gear?.ammoMost ?? null,
      crosshair: sights
        ? { charge: drawing ? Math.min(1, ownView.action.elapsed / FIGHT_TICKS.drawFull) : null }
        : null,
    };
    const edge = this.standing;
    const hints = edge.kind === 'dead' ? HINTS.dead : footHints(fight.arts?.art ?? 0);
    return { shot, figures, standing: edge, marks, swings, fight: fought, hints };
  }

  /** The drops lying for the player, flying and standing, seen from `eye`, laid after the marks in `out`, and where
   *  each came to rest this frame; a Rare or finer chimes as it comes to rest. */
  private dropMarks(clock: number, eye: readonly [number, number, number], out: number[]) {
    const shown = this.drops.frame(this.gear?.gear?.drops ?? [], clock, eye, out);
    const rarest = Math.max(-1, ...shown.rested);
    if (rarest >= 2) chime(rarest);
    return shown;
  }

  /** Every other player's figure, gliding toward where the room last saw them, drawn off it by the attack `feel` (and
   *  kept as drawn there), flashing as it is struck, faint while Veiled, and its cast's spark in its Art's colour. */
  private otherCards(
    eyeX: number,
    eyeY: number,
    clock: number,
    frameTicks: number,
    feel: {
      shift: (id: number, view: FighterView | null) => Vector;
      drawnAt: Map<number, DrawnFigure>;
      otherViews: ReadonlyMap<number, FighterView>;
    },
  ): CardAt[] {
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
      // A cast's spark glows in the caster's Art, as the player's own does.
      const glow = placed.anim === 'cast' ? castLookOf(fight, number) : 0;
      const card = forge.card(placed.id, placed.dress, placed.anim, view, frame, flip, glow);
      const flash = effects.flashes.flashOf(number);
      const veiled = veiledIn(fight, number);
      const moved = feel.shift(number, feel.otherViews.get(number) ?? null);
      const atFeet: Vector = [placed.x + moved[0], placed.y + moved[1], placed.z + moved[2]];
      feel.drawnAt.set(number, { feet: atFeet, anim: placed.anim, flip });
      if (card) cards.push({ card, ...cardStand(atFeet[0], atFeet[1], eyeX, eyeY), z: atFeet[2], flip, flash, veiled });
    }
    otherGlides.keep(new Set(this.otherPlayers.placed.keys()));
    // A social space's people, each keeping a step of its own.
    for (const one of this.folk) {
      const { view, flip } = viewOf(one.facing, one.x, one.y, eyeX, eyeY);
      const frames = forge.frames(one.dress.body, one.anim);
      const own = clock + one.id * STRIDE_APART_S;
      const frame = one.frame === null ? frameAt(own, frames, OTHERS_FPS) : Math.min(one.frame, frames - 1);
      const card = forge.card(one.id, one.dress, one.anim, view, frame, flip);
      if (card) cards.push({ card, ...cardStand(one.x, one.y, eyeX, eyeY), z: one.z, flip });
    }
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

  /** Leaves the node: its room lets the player go, and every other player's figure and its people are taken away. */
  leave(): void {
    if (this.link instanceof RoomConnection) this.link.close();
    this.otherPlayers.clear();
    this.plaza?.close();
    this.prompt?.remove();
    // An Anima's edge frame cast just before leaving must not stay over the next place.
    showAnimaEdge(QUIET);
  }
}
