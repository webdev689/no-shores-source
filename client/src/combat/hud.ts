import type { FightEvent } from '../network/messages.ts';
import { rayHit } from '../player/playerCamera.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';
import { PLATES } from '../plus/barLayout.ts';
import { COMPASS, headingOf } from '../plus/compass.ts';
import { compassNode } from './compassNode.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { AbilityBar, type AbilityState, type ArtPictures } from './abilityBar.ts';
import { ammoNode } from './ammoCounter.ts';
import { animaEdgeNode } from './animaMoment.ts';
import { edgeArrow, parryCue, threatens } from './cues.ts';
import { FoeBars, type MarkedFoe, type PlateViewing } from './foeBars.ts';
import { FoePlate } from './foePlate.ts';
import { FoeTarget } from './foeTarget.ts';
import { type Box, type Said, Words, wordsOf } from './hitWords.ts';
import { arrowNode, crosshairNode, hurtNode, lockMarkNode, parryNode, veilNode } from './hudCues.ts';
import { contactOf, strokeTravel } from './impacts.ts';
import { cameraOf, landBlocks, SIGHT_SKIN_M } from './plateSight.ts';
import type { Cards } from '../player/cards.ts';
import { ItemPictures } from '../player/itemPictures.ts';
import { UNABLE } from './casting.ts';
import { EDGE, type HudLayout, hudLayout } from './hudLayout.ts';
import { Vitals } from './vitals.ts';
import { type ArmsShown, WeaponRows } from './weapons.ts';

/** What the display is drawn from each frame: the player's fighter, the foes, every fighter's place by number, how the
 *  camera projects a point, the canvas's size in CSS pixels, the fight's events since the last frame, whether the view
 *  is the player's own eyes, whether a swing or a dodge was pressed since the last frame, why the link to the room
 *  was lost (null while it holds), and whether it is joining the room again. */
export interface HudFrame {
  readonly own: FighterView | null;
  readonly foes: readonly MarkedFoe[];
  readonly where: (id: number) => readonly [number, number, number] | null;
  readonly matrix: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly events: readonly FightEvent[];
  readonly player: number;
  readonly firstPerson: boolean;
  readonly pressed: boolean;
  readonly lost: string | null;
  readonly rejoining?: boolean;
  /** The crosshair, while a ranged weapon aims or is out in first person, with a bow's charge (0 to 1) while it aims. */
  readonly crosshair?: { readonly charge: number | null } | null;
  /** The shots left, beside the crosshair, while the Ranged loadout is drawn; null while they are not shown. */
  readonly ammo?: number | null;
  /** The Ranged loadout's capacity, by which few shots left read as low; null unknown. */
  readonly ammoMost?: number | null;
  /** Whether a press of the player's guard now could open a parry window (Fighting's parryOpen). */
  readonly parryOpen?: boolean;
  /** The blocks of the place, which no plate over a figure is seen through. */
  readonly blocks?: readonly Block[];
  /** The land's height under a point (null where none is known), which no plate over a figure is seen through either;
   *  null for a place with no land of its own. */
  readonly groundAt: ((x: number, y: number) => number | null) | null;
  /** The Art's abilities as the bar shows them (Fighting's abilities); none hides the bar. */
  readonly abilities?: AbilityState | null;
  /** Whether the player has just stepped onto an Ammo box they cannot take, their ammunition full (DropsShown's
   *  ammoFull). */
  readonly ammoFull?: boolean;
  /** The loadouts as the weapons' rows show them; none hides them. */
  readonly arms?: ArmsShown | null;
}

/** A foe winding up an iron blow this near is told to be dodged. */
const IRON_NEAR_M = 12;
/** How long the dead lie before standing again, in ticks (crates/combat/src/tuning.rs RESPAWN). */
const RESPAWN_TICKS = 240;
/** How long the stamina bar flashes for a swing or a dodge asked with none, and the screen's edge for a blow taken. */
const FLASH_SECONDS = 0.45;
/** How far inside the canvas's edge an arrow to a foe off the screen stands, in CSS pixels; and how far clear of the
 *  vitals or the Arts and weapons it stands where it would fall on them: half an arrow and a little more. */
const ARROW_INSET = 28;
const ARROW_CLEAR = 22;
/** A parry ring's span as a blow begins and as it lands (its fixed inner ring's), in CSS pixels; and how high over
 *  the foe's feet it stands, in metres, above the foe's plate. */
const RING_WIDEST = 56;
const RING_CLOSED = 14;
const RING_HEIGHT = 2.5;
/** How high over a foe's feet its plate's foot stands, in metres: just over its head (a body is 1.8 m tall), under
 *  where its parry ring closes, so the plate reads as the foe's own and the ring stays clear above it. */
const PLATE_OVER_M = 1.9;
/** A word with no striker to meet stands this high over its fighter's feet (metres). */
const WORD_HIGH_M = 1.2;
/** What the player is told on stepping onto an Ammo box they cannot take. */
const AMMO_FULL = 'Ammo full';

/** A point's clip coordinates through the camera: x, y up, and w (0 or less behind it). */
function clipOf(matrix: ArrayLike<number>, point: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = point;
  const component = (row: number) =>
    (matrix[row] ?? 0) * x + (matrix[4 + row] ?? 0) * y + (matrix[8 + row] ?? 0) * z + (matrix[12 + row] ?? 0);
  return [component(0), component(1), component(3)];
}

/** Where a point falls on the canvas in CSS pixels, or null behind the camera. */
export function project(
  matrix: ArrayLike<number>,
  point: readonly [number, number, number],
  width: number,
  height: number,
) {
  const [clipX, clipY, clipW] = clipOf(matrix, point);
  if (clipW <= 1e-6) return null;
  return { x: ((clipX / clipW + 1) / 2) * width, y: ((1 - clipY / clipW) / 2) * height };
}

/** A spot on the screen's edge moved along the edge to stand `gap` above `box` (CSS pixels from the display's corner),
 *  or below it when `below`, where it would fall within `gap` of it; elsewhere as it is. */
export function clearOf<Spot extends { readonly x: number; readonly y: number }>(
  spot: Spot,
  box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  gap: number,
  below = false,
): Spot {
  const near = (value: number, from: number, to: number) => value >= from - gap && value <= to + gap;
  if (!near(spot.x, box.left, box.right) || !near(spot.y, box.top, box.bottom)) return spot;
  return { ...spot, y: below ? box.bottom + gap : box.top - gap };
}

/** The veil over the display, by what holds the player: joining the room again, the room lost (and why), or their
 *  death (the ticks they have lain); a link's veil is plain, death's is blood. Null while none of these holds. */
export function veilOf(
  frame: Pick<HudFrame, 'own' | 'lost' | 'rejoining'>,
): { readonly words: string; readonly link: boolean } | null {
  if (frame.rejoining) return { words: 'Reconnecting…', link: true };
  if (frame.lost !== null) return { words: `The link to the room was lost: ${frame.lost}.`, link: true };
  const dead = frame.own?.action.kind === 'dead' ? frame.own.action : null;
  if (!dead) return null;
  const seconds = Math.ceil(Math.max(0, RESPAWN_TICKS - dead.elapsed) / 60);
  return { words: `You fell. Standing again in ${seconds} s`, link: false };
}

/** Whether the line from `from` to `to` meets one of `blocks` short of its last `SIGHT_SKIN_M`. */
export function blockedBy(
  blocks: readonly Block[],
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): boolean {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  return length > SIGHT_SKIN_M && rayHit(from, to, blocks) < 1 - SIGHT_SKIN_M / length;
}

/** The fight's display over the view, kept each frame from a `HudFrame` and drawn as a layer of the interface. */
export class Hud {
  private readonly vitals = new Vitals();
  private readonly target = new FoePlate({ poise: true, remembers: 'whole' });
  private readonly foeBars = new FoeBars();
  private readonly foeTarget = new FoeTarget();
  private readonly words = new Words();
  /** The side the next number with no stroke to follow is thrown to. */
  private nextSide = 1;
  private readonly abilities: AbilityBar | null;
  private readonly weapons: WeaponRows;
  private layout: HudLayout = hudLayout(0, 0);
  /** The page's own pieces beside the display (the game's hints), in its CSS pixels, which the arrows keep clear of. */
  private readonly beside: () => readonly Box[];
  /** The foes whose iron wind-up the player has been told of, until it ends. */
  private readonly ironTold = new Set<number>();
  private staminaFlash = 0;
  private hurtFlash = 0;
  /** What the last frame showed: its view, the veil, the crosshair's charge (undefined for none), the shots, the
   *  compass's heading, the lock's mark, the target's share shown, the parry rings and the arrows at the edge. */
  private view = { width: 0, height: 0 };
  private veil: ReturnType<typeof veilOf> = null;
  private charge: number | null | undefined = undefined;
  private ammo: { readonly ammo: number | null | undefined; readonly most: number | null } = { ammo: null, most: null };
  private heading: number | null = null;
  private lockSpot: { readonly x: number; readonly y: number } | null = null;
  private targetShare = 0;
  private rings: readonly {
    readonly x: number;
    readonly y: number;
    readonly span: number;
    readonly kind: 'ring' | 'now' | 'iron';
  }[] = [];
  private edges: readonly { readonly x: number; readonly y: number; readonly angle: number }[] = [];

  /** With `pictures`, the game's pictures of an Art (`abilityPictures`), the Art's abilities stand at the bottom left;
   *  with `forge`, the weapons beside them are drawn as its pictures. The page's own pieces `beside` answers (the game's
   *  hints, CSS pixels) are kept clear of as the display's corners are. */
  constructor(
    pictures: ((art: number) => ArtPictures | null) | null = null,
    forge: Cards | null = null,
    beside: () => readonly Box[] = () => [],
  ) {
    this.beside = beside;
    this.abilities = pictures && new AbilityBar(pictures);
    this.weapons = new WeaponRows(forge && new ItemPictures(forge));
  }

  /** Whether a Boss's bar stands under the compass. */
  get bossed(): boolean {
    return this.foeBars.bossShown !== null;
  }

  update(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    this.view = { width: frame.width, height: frame.height };
    this.layout = hudLayout(frame.width, frame.height);
    this.vitals.lay(this.layout.length, this.layout.wide);
    this.weapons.lay(this.layout.wide, this.layout.zoom);
    this.flash(frame, seconds);
    this.veil = veilOf(frame);
    this.charge = frame.crosshair ? (frame.crosshair.charge ?? null) : undefined;
    this.ammo = { ammo: frame.ammo, most: frame.ammoMost ?? null };
    const overHead = (view: FighterView) => {
      const point = [view.x, view.y, view.z + PLATE_OVER_M] as const;
      const spot = project(frame.matrix, point, frame.width, frame.height);
      return spot && { ...spot, depth: clipOf(frame.matrix, point)[2] };
    };
    const lock = own?.target ?? null;
    const chosen = this.foeTarget.step({ player: frame.player, lock, foes: frame.foes, events: frame.events }, seconds);
    const { blocks = [], groundAt } = frame;
    const viewing: PlateViewing = {
      camera: cameraOf(frame.matrix),
      blocked: (from, to) => blockedBy(blocks, from, to) || (!!groundAt && landBlocks(groundAt, from, to)),
      fought: (id) => this.foeTarget.foughtShare(id),
      locked: lock,
    };
    this.heading = viewing.camera ? headingOf(viewing.camera.forward) : this.heading;
    const boss = this.foeBars.update(frame.foes, own, overHead, viewing, seconds);
    this.markTarget(frame, chosen, boss, seconds);
    this.vitals.update(own, seconds, this.staminaFlash > 0, !!chosen || !!boss);
    if (frame.abilities) this.abilities?.update(frame.abilities, seconds, UNABLE.has(own?.action.kind ?? ''));
    else this.abilities?.hide();
    this.weapons.update(frame.arms ?? { gear: null, loadout: 0, drawn: false, dress: null }, own, seconds);
    this.edges = this.threats(frame);
    this.rings = this.parries(frame);
    this.floatWords(frame, seconds);
  }

  /** Over each foe at a blow the player can parry, a ring closing onto a fixed one as the blow lands, gold once a
   *  press would parry it; over an iron one, a red mark with no ring. */
  private parries(frame: HudFrame): Hud['rings'] {
    return frame.foes.flatMap(({ view }) => {
      const cue = parryCue(view, frame.player, frame.parryOpen ?? true);
      const spot = cue && project(frame.matrix, [view.x, view.y, view.z + RING_HEIGHT], frame.width, frame.height);
      if (!cue || !spot) return [];
      const iron = cue === 'iron';
      const span = iron ? RING_CLOSED : RING_CLOSED + (RING_WIDEST - RING_CLOSED) * cue.share;
      return [{ ...spot, span, kind: iron ? 'iron' : cue.now ? 'now' : 'ring' } as const];
    });
  }

  /** The stamina bar flashes for a swing or a dodge asked with no stamina; the screen's edge, red, for a blow taken. */
  private flash(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    if (frame.pressed && own && own.stamina <= 0) this.staminaFlash = FLASH_SECONDS;
    const struck = frame.events.some((event) => event.defender === frame.player && event.amount > 0);
    if (struck) this.hurtFlash = FLASH_SECONDS;
    this.staminaFlash = Math.max(0, this.staminaFlash - seconds);
    this.hurtFlash = Math.max(0, this.hurtFlash - seconds);
  }

  /** The soft lock's mark at its foe's chest, and the target's plate at the top as much as it shows (`chosen`),
   *  unless the boss bar shows that foe already. */
  private markTarget(
    frame: HudFrame,
    chosen: { readonly id: number; readonly share: number } | null,
    boss: MarkedFoe | null,
    seconds: number,
  ): void {
    const lock = frame.own?.target ?? null;
    const locked = frame.foes.find((each) => each.id === lock);
    this.lockSpot =
      (locked &&
        project(frame.matrix, [locked.view.x, locked.view.y, locked.view.z + 1.1], frame.width, frame.height)) ??
      null;
    const foe = chosen && chosen.id !== boss?.id ? frame.foes.find((each) => each.id === chosen.id) : undefined;
    this.target.keep(new Set(frame.foes.map((each) => each.id)));
    this.targetShare = foe && chosen ? chosen.share : 0;
    if (foe) this.target.show(foe, seconds);
  }

  /** Where an arrow at the screen's edge stands toward each foe off the screen at a blow or a draw meant for the
   *  player, until it ends. */
  private threats(frame: HudFrame): Hud['edges'] {
    return frame.foes.flatMap(({ view }) => {
      if (!threatens(view, frame.player)) return [];
      const clip = clipOf(frame.matrix, [view.x, view.y, view.z + 1.1]);
      return edgeArrow(clip, frame.width, frame.height, ARROW_INSET) ?? [];
    });
  }

  /** The events' words, each where its blow met the body, thrown the way the stroke went, and clear of the plates (in
   *  first person, those on the player below the crosshair); a warning over a foe near the player as it begins an
   *  iron wind-up; and "Ammo full" on the player as they step onto an Ammo box they cannot take. */
  private floatWords(frame: HudFrame, seconds: number): void {
    const holding = (id: number) => frame.foes.find((foe) => foe.id === id)?.view.action.kind === 'telegraph';
    const projectWord = (point: readonly [number, number, number]) =>
      project(frame.matrix, point, frame.width, frame.height);
    for (const said of wordsOf(frame.events, frame.player, holding)) {
      const place = frame.where(said.defender);
      if (!place) continue;
      const own = frame.firstPerson && said.defender === frame.player;
      // What a shield took is said in its element's colour.
      const shield = said.tone === 'shield' ? frame.foes.find((foe) => foe.id === said.defender)?.shield : null;
      const told = shield ? { ...said, shield: shield.element } : said;
      const from = said.striker === undefined ? null : frame.where(said.striker);
      const contact = from ? contactOf(place, from) : ([place[0], place[1], place[2] + WORD_HIGH_M] as const);
      this.words.say(told, own ? null : contact, this.sideOf(said, place, from, contact, projectWord));
    }
    for (const { id, view } of frame.foes) {
      const iron = view.action.kind === 'telegraph' && view.action.iron;
      const near = !!frame.own && Math.hypot(view.x - frame.own.x, view.y - frame.own.y) <= IRON_NEAR_M;
      if (!iron) this.ironTold.delete(id);
      else if (near && !this.ironTold.has(id)) {
        this.ironTold.add(id);
        this.words.say({ text: 'Dodge!', tone: 'warn', tags: [] }, [view.x, view.y, view.z + 2.3], 0, 0.5);
      }
    }
    if (frame.ammoFull && frame.own) {
      const { x, y, z } = frame.own;
      const place = frame.firstPerson ? null : ([x, y, z + WORD_HIGH_M] as const);
      this.words.say({ text: AMMO_FULL, tone: 'plain', tags: [] }, place, 0, 0.5);
    }
    this.words.update(projectWord, frame.width, frame.height, seconds, this.foeBars.columns);
  }

  /** The side of the screen a word is thrown to: the way its stroke's blade travelled as the eye sees it, else one
   *  side and the other in turn for a number, and neither for a word alone. */
  private sideOf(
    said: Said,
    place: readonly [number, number, number],
    from: readonly [number, number, number] | null,
    contact: readonly [number, number, number],
    projectWord: (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null,
  ): number {
    const travel = from && strokeTravel(said.stroke ?? 0, from, place);
    const [here, there] = travel
      ? [projectWord(contact), projectWord([contact[0] + travel[0], contact[1] + travel[1], contact[2] + travel[2]])]
      : [null, null];
    if (here && there && Math.abs(there.x - here.x) > 1) return Math.sign(there.x - here.x);
    if (said.amount === undefined) return 0;
    this.nextSide = -this.nextSide;
    return this.nextSide;
  }

  /** The display as the last frame left it, over the whole view, letting the pointer through to the world: what
   *  stands over the world, then the compass's column at the top over it (the compass, the boss bar, the target's
   *  plate), then the veil over all. The arrows keep clear of the vitals and the Arts and weapons where `ui` last laid
   *  them. */
  node(ui: Interface): Node {
    const { zoom, stacked, compassTop } = this.layout;
    const room = this.view.width / zoom;
    const arms = this.armsNode();
    const column: Node = {
      direction: 'column',
      alignX: 'center',
      gap: COMPASS.gap * zoom,
      width: 'grow',
      float: { to: 'screen', y: stacked ? compassTop : COMPASS.top * zoom, z: 1 },
      children: [
        this.heading !== null && compassNode(Math.min(COMPASS.width, COMPASS.share * room) * zoom, this.heading, zoom),
        this.foeBars.bossNode(Math.round(Math.min(PLATES.boss.width, PLATES.boss.share * room) * zoom), zoom),
        this.targetShare > 0 && this.targetNode(room, zoom),
      ],
    };
    return {
      width: 'grow',
      height: 'grow',
      through: true,
      children: [
        hurtNode(this.hurtFlash / FLASH_SECONDS),
        this.vitals.node(zoom),
        arms,
        this.lockSpot && lockMarkNode(this.lockSpot),
        ...this.foeBars.overheadNodes(),
        ...this.rings.map((ring) => parryNode(ring, ring.span, ring.kind)),
        ...this.arrows(ui).map(arrowNode),
        ...this.words.nodes(),
        this.charge !== undefined && crosshairNode(this.charge),
        ammoNode(this.ammo.ammo, this.ammo.most),
        column,
        this.veil && veilNode(this.veil),
        animaEdgeNode(),
      ],
    };
  }

  private targetNode(room: number, zoom: number): Child {
    const made = this.target.node({
      kind: 'target',
      width: Math.round(Math.min(340, PLATES.boss.share * room) * zoom),
      zoom,
    });
    return made && (this.targetShare < 1 ? { ...made, opacity: this.targetShare } : made);
  }

  /** The Art's abilities and the weapons at the bottom left, the weapons over the Arts in a view too narrow for both. */
  private armsNode(): Child {
    const { zoom, wide, stacked } = this.layout;
    const abilities = this.abilities?.node(wide, zoom) ?? null;
    const weapons = this.weapons.node();
    if (!abilities && !weapons) return null;
    return {
      id: 'fight-arms',
      direction: stacked ? 'column' : 'row',
      alignY: 'end',
      alignX: 'start',
      gap: (wide ? 20 : 14) * zoom,
      float: { to: 'screen', at: [0, 1], anchor: [0, 1], x: EDGE.side * zoom, y: -EDGE.foot * zoom, z: 1 },
      children: stacked ? [weapons, abilities] : [abilities, weapons],
    };
  }

  /** The arrows to threats off the screen, each standing below the vitals and above the Arts and weapons (and the
   *  page's pieces beside the display) where it would fall on them. */
  private arrows(ui: Interface): readonly { readonly x: number; readonly y: number; readonly angle: number }[] {
    if (this.edges.length === 0) return [];
    const sides = (box: { x: number; y: number; width: number; height: number } | null): Box | null =>
      box && box.width + box.height > 0
        ? { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
        : null;
    const vitals = sides(ui.boxOf('fight-vitals'));
    // Above what stands from the foot, the lowest first, so a move past one lands clear of the next.
    const under = [sides(ui.boxOf('fight-arms')), ...this.beside()].flatMap((box) =>
      box && box.right > box.left && box.bottom > box.top ? [box] : [],
    );
    under.sort((one, other) => other.bottom - one.bottom);
    return this.edges.map((edge) => {
      let spot = vitals ? clearOf(edge, vitals, ARROW_CLEAR, true) : edge;
      for (const box of under) spot = clearOf(spot, box, ARROW_CLEAR);
      return spot;
    });
  }
}
