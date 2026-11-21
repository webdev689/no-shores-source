import type { FightEvent } from '../network/messages.ts';
import { rayHit } from '../player/playerCamera.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';
import { Compass, headingOf } from '../plus/compass.ts';
import { AbilityBar, type AbilityState, type ArtPictures } from './abilityBar.ts';
import { AmmoCounter } from './ammoCounter.ts';
import { edgeArrow, parryCue, threatens } from './cues.ts';
import { FoeBars, type MarkedFoe, type PlateViewing } from './foeBars.ts';
import { FoePlate } from './foePlate.ts';
import { FoeTarget } from './foeTarget.ts';
import { type Box, type Said, Words, wordsOf } from './hitWords.ts';
import { contactOf, strokeTravel } from './impacts.ts';
import { PublicBanner, type PublicShown, StoreBars } from './publicBanner.ts';
import { wearFightSheet } from './hudSheet.ts';
import { element, setStyle, showNode } from './meter.ts';
import { cameraOf, landBlocks, SIGHT_SKIN_M } from './plateSight.ts';
import type { Cards } from '../player/cards.ts';
import { ItemPictures } from '../player/itemPictures.ts';
import { UNABLE } from './casting.ts';
import { type HudLayout, hudLayout } from './hudLayout.ts';
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
  /** The zone's public event as the display shows it; none where the zone holds none. */
  readonly public?: PublicShown | null;
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

/** The fight's display over the canvas, which lays its own sheet on the page and dresses `root` in it. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly vitals: Vitals;
  private readonly compass: Compass;
  private readonly banner: PublicBanner;
  private readonly stores: StoreBars;
  private readonly target: FoePlate;
  private readonly mark: HTMLElement;
  private readonly over: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly ammo: AmmoCounter;
  private readonly foeBars: FoeBars;
  private readonly foeTarget = new FoeTarget();
  private readonly words: Words;
  /** The side the next number with no stroke to follow is thrown to. */
  private nextSide = 1;
  private readonly column: HTMLElement;
  private readonly arms: HTMLElement;
  private readonly abilities: AbilityBar | null;
  private readonly weapons: WeaponRows;
  private layout: HudLayout | null = null;
  /** Where the vitals and the Arts and weapons stand, read from the page once and again only after they or the view
   *  change size (`viewed`, the view's last), never each frame. */
  private corners: { readonly vitals: Box | null; readonly under: readonly Box[] } | null = null;
  private readonly beside: readonly HTMLElement[];
  private viewed: readonly [number, number] = [0, 0];
  private readonly arrows = new Map<number, HTMLElement>();
  private readonly rings = new Map<number, HTMLElement>();
  /** The foes whose iron wind-up the player has been told of, until it ends. */
  private readonly ironTold = new Set<number>();
  private staminaFlash = 0;
  private hurtFlash = 0;

  /** With `pictures`, the game's pictures of an Art (`abilityPictures`), the Art's abilities stand at the bottom left;
   *  with `forge`, the weapons beside them are drawn as its pictures. The page's own pieces in `beside` (the game's
   *  hints) are kept clear of as the display's corners are. */
  constructor(
    root: HTMLElement,
    pictures: ((art: number) => ArtPictures | null) | null = null,
    forge: Cards | null = null,
    beside: readonly HTMLElement[] = [],
  ) {
    wearFightSheet(root.ownerDocument);
    root.classList.add('fight-hud');
    this.root = root;
    this.beside = beside;
    // Back to front: what stands over the world, then the compass's column at the top over it (the compass, the boss
    // bar, the target's plate), then the veil over all.
    this.hurt = element('div', 'hurt', root);
    this.vitals = new Vitals(root);
    this.arms = element('div', 'arms', root);
    this.abilities = pictures && new AbilityBar(this.arms, pictures);
    this.weapons = new WeaponRows(this.arms, forge && new ItemPictures(forge));
    this.mark = element('div', 'mark', root);
    this.over = element('div', 'over', root);
    this.crosshair = element('div', 'crosshair', root);
    this.crosshair.hidden = true;
    element('div', 'charge', this.crosshair);
    this.ammo = new AmmoCounter(root);
    this.column = element('div', 'compass-column', root);
    this.compass = new Compass(this.column);
    // Under the compass, over the boss bar and the target's plate, so neither ever stands on it.
    this.banner = new PublicBanner(this.column);
    this.stores = new StoreBars(this.over);
    this.foeBars = new FoeBars(root, this.over, this.column);
    this.target = new FoePlate(this.column, 'target', { poise: true, remembers: 'whole' });
    this.words = new Words(this.over);
    this.veil = element('div', 'veil', root);
    if (typeof ResizeObserver !== 'undefined') {
      const resized = new ResizeObserver(() => (this.corners = null));
      for (const node of [this.vitals.root, this.arms, ...beside]) resized.observe(node);
    }
  }

  /** Lays the corner pieces for a view `width` by `height`, only when that changes what they need. */
  private lay(width: number, height: number): void {
    // Any change of the view's size may move the corners, even one that lays nothing again.
    if (width !== this.viewed[0] || height !== this.viewed[1]) [this.viewed, this.corners] = [[width, height], null];
    const next = hudLayout(width, height);
    const was = this.layout;
    const same = was?.wide === next.wide && was.zoom === next.zoom && was.length === next.length;
    if (same && was?.compassTop === next.compassTop) return;
    this.layout = next;
    this.root.classList.toggle('wide', next.wide);
    this.root.classList.toggle('double', next.zoom === 2);
    this.root.classList.toggle('stacked', next.stacked);
    // The column's own pixels: past 1440p it stands zoomed, as the corners do.
    this.column.style.top = next.stacked ? `${next.compassTop / next.zoom}px` : '';
    this.vitals.lay(next.length, next.wide);
    this.weapons.lay(next.wide, next.zoom);
  }

  update(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    this.lay(frame.width, frame.height);
    this.flash(frame, seconds);
    const veil = veilOf(frame);
    showNode(this.veil, !!veil);
    if (veil) {
      if (this.veil.textContent !== veil.words) this.veil.textContent = veil.words;
      this.veil.classList.toggle('link', veil.link);
    }
    const charge = frame.crosshair?.charge ?? null;
    showNode(this.crosshair, !!frame.crosshair);
    this.crosshair.classList.toggle('charging', charge !== null);
    this.crosshair.classList.toggle('full', charge !== null && charge >= 1);
    setStyle(this.crosshair, '--charge', `${Math.round(Math.min(1, charge ?? 0) * 360)}deg`);
    this.ammo.update(frame.ammo, frame.ammoMost);
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
    const shown = frame.public ?? null;
    const from = [own?.x ?? 0, own?.y ?? 0] as const;
    if (viewing.camera) this.compass.update(headingOf(viewing.camera.forward), from, [], shown?.places ?? []);
    this.banner.update(shown?.banner ?? null, seconds, shown?.beat ?? null);
    this.stores.update(
      shown?.stores ?? [],
      (point) => project(frame.matrix, point, frame.width, frame.height),
      seconds,
    );
    const boss = this.foeBars.update(frame.foes, own, overHead, viewing, seconds);
    this.markTarget(frame, chosen, boss, seconds);
    this.vitals.update(own, seconds, this.staminaFlash > 0, !!chosen || !!boss);
    if (frame.abilities) this.abilities?.update(frame.abilities, seconds, UNABLE.has(own?.action.kind ?? ''));
    else this.abilities?.hide();
    this.weapons.update(frame.arms ?? { gear: null, loadout: 0, drawn: false, dress: null }, own, seconds);
    this.pointAtThreats(frame);
    this.ringParries(frame);
    this.floatWords(frame, seconds);
  }

  /** Over each foe at a blow the player can parry, a ring closing onto a fixed one as the blow lands, gold once a
   *  press would parry it; over an iron one, a red mark with no ring. */
  private ringParries(frame: HudFrame): void {
    const shown = new Set<number>();
    for (const { id, view } of frame.foes) {
      const cue = parryCue(view, frame.player, frame.parryOpen ?? true);
      const spot = cue && project(frame.matrix, [view.x, view.y, view.z + RING_HEIGHT], frame.width, frame.height);
      if (!cue || !spot) continue;
      shown.add(id);
      const ring = this.rings.get(id) ?? element('div', 'parry', this.over);
      this.rings.set(id, ring);
      const iron = cue === 'iron';
      ring.classList.toggle('iron', iron);
      ring.classList.toggle('now', !iron && cue.now);
      const span = iron ? RING_CLOSED : RING_CLOSED + (RING_WIDEST - RING_CLOSED) * cue.share;
      setStyle(ring, 'transform', `translate(${spot.x}px, ${spot.y}px)`);
      setStyle(ring, '--span', `${span}px`);
    }
    for (const [id, ring] of this.rings) {
      if (shown.has(id)) continue;
      ring.remove();
      this.rings.delete(id);
    }
  }

  /** The stamina bar flashes for a swing or a dodge asked with no stamina; the screen's edge, red, for a blow taken. */
  private flash(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    if (frame.pressed && own && own.stamina <= 0) this.staminaFlash = FLASH_SECONDS;
    const struck = frame.events.some((event) => event.defender === frame.player && event.amount > 0);
    if (struck) this.hurtFlash = FLASH_SECONDS;
    this.staminaFlash = Math.max(0, this.staminaFlash - seconds);
    this.hurtFlash = Math.max(0, this.hurtFlash - seconds);
    setStyle(this.hurt, 'opacity', String(this.hurtFlash / FLASH_SECONDS));
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
    const spot =
      locked && project(frame.matrix, [locked.view.x, locked.view.y, locked.view.z + 1.1], frame.width, frame.height);
    showNode(this.mark, !!spot);
    if (spot) setStyle(this.mark, 'transform', `translate(${spot.x}px, ${spot.y}px)`);
    const foe = chosen && chosen.id !== boss?.id ? frame.foes.find((each) => each.id === chosen.id) : undefined;
    showNode(this.target.root, !!foe);
    this.target.keep(new Set(frame.foes.map((each) => each.id)));
    if (!foe || !chosen) return;
    this.target.show(foe, seconds);
    setStyle(this.target.root, 'opacity', chosen.share < 1 ? chosen.share.toFixed(2) : '');
  }

  /** An arrow at the screen's edge toward each foe off the screen at a blow or a draw meant for the player, until it
   *  ends, standing below the vitals and above the Arts and weapons where it would fall on them. */
  private pointAtThreats(frame: HudFrame): void {
    const shown = new Set<number>();
    for (const { id, view } of frame.foes) {
      if (!threatens(view, frame.player)) continue;
      const clip = clipOf(frame.matrix, [view.x, view.y, view.z + 1.1]);
      const edge = edgeArrow(clip, frame.width, frame.height, ARROW_INSET);
      if (!edge) continue;
      this.corners ??= this.cornerBoxes();
      const { vitals, under } = this.corners;
      // Below the vitals; above what stands from the foot, the lowest first, so a move past one lands clear of the next.
      let spot = vitals ? clearOf(edge, vitals, ARROW_CLEAR, true) : edge;
      for (const box of under) spot = clearOf(spot, box, ARROW_CLEAR);
      shown.add(id);
      const arrow = this.arrows.get(id) ?? element('div', 'arrow', this.over);
      this.arrows.set(id, arrow);
      setStyle(arrow, 'transform', `translate(${spot.x}px, ${spot.y}px) rotate(${spot.angle}rad)`);
    }
    for (const [id, arrow] of this.arrows) {
      if (shown.has(id)) continue;
      arrow.remove();
      this.arrows.delete(id);
    }
  }

  /** Where the vitals stand, then the Arts and weapons and the page's pieces beside the display from the foot up, read
   *  from the page in the display's own pixels; a piece shown nowhere (an empty box) is left out. */
  private cornerBoxes(): { readonly vitals: Box | null; readonly under: readonly Box[] } {
    const origin = this.root.getBoundingClientRect();
    const boxOf = (node: HTMLElement): Box | null => {
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return null;
      const [left, top] = [box.left - origin.left, box.top - origin.top];
      return { left, top, right: left + box.width, bottom: top + box.height };
    };
    const under = [this.arms, ...this.beside].flatMap((node) => boxOf(node) ?? []);
    under.sort((one, other) => other.bottom - one.bottom);
    return { vitals: boxOf(this.vitals.root), under };
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
}
