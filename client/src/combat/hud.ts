import type { FightEvent } from '../network/messages.ts';
import { rayHit } from '../player/playerCamera.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';
import { Compass, headingOf } from '../plus/compass.ts';
import { edgeArrow, parryCue, threatens } from './cues.ts';
import { FoeBars, type MarkedFoe, type PlateViewing } from './foeBars.ts';
import { FoePlate } from './foePlate.ts';
import { FoeTarget } from './foeTarget.ts';
import { Words, wordsOf } from './hitWords.ts';
import { wearFightSheet } from './hudSheet.ts';
import { element } from './meter.ts';
import { cameraOf, SIGHT_SKIN_M } from './plateSight.ts';
import { Vitals } from './vitals.ts';

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
  /** Whether a press of the player's guard now could open a parry window (Fighting's parryOpen). */
  readonly parryOpen?: boolean;
  /** The blocks of the place, which no plate over a figure is seen through. */
  readonly blocks?: readonly Block[];
}

/** A foe winding up an iron blow this near is told to be dodged. */
const IRON_NEAR_M = 12;
/** How long the dead lie before standing again, in ticks (crates/combat/src/tuning.rs RESPAWN). */
const RESPAWN_TICKS = 240;
/** How long the stamina bar flashes for a swing or a dodge asked with none, and the screen's edge for a blow taken. */
const FLASH_SECONDS = 0.45;
/** How far inside the canvas's edge an arrow to a foe off the screen stands, in CSS pixels; and how far clear of the
 *  vitals' row it stands where it would fall on it: half an arrow, a bar's frame and a little more. */
const ARROW_INSET = 28;
const ARROW_CLEAR = 22;
/** A parry ring's span as a blow begins and as it lands (its fixed inner ring's), in CSS pixels; and how high over
 *  the foe's feet it stands, in metres, a foe's name and bar standing just above it. */
const RING_WIDEST = 56;
const RING_CLOSED = 14;
const RING_HEIGHT = 2.5;

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

/** A spot on the screen's edge moved up the edge to stand `gap` above `box` (CSS pixels from the display's corner)
 *  where it would fall within `gap` of it; elsewhere as it is. */
export function clearOf<Spot extends { readonly x: number; readonly y: number }>(
  spot: Spot,
  box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  gap: number,
): Spot {
  const near = (value: number, from: number, to: number) => value >= from - gap && value <= to + gap;
  return near(spot.x, box.left, box.right) && near(spot.y, box.top, box.bottom) ? { ...spot, y: box.top - gap } : spot;
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
  private readonly target: FoePlate;
  private readonly mark: HTMLElement;
  private readonly over: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly foeBars: FoeBars;
  private readonly foeTarget = new FoeTarget();
  private readonly words: Words;
  private readonly arrows = new Map<number, HTMLElement>();
  private readonly rings = new Map<number, HTMLElement>();
  /** The foes whose iron wind-up the player has been told of, until it ends. */
  private readonly ironTold = new Set<number>();
  private staminaFlash = 0;
  private hurtFlash = 0;

  constructor(root: HTMLElement) {
    wearFightSheet(root.ownerDocument);
    root.classList.add('fight-hud');
    this.root = root;
    // Back to front: what stands over the world, then the compass's column at the top over it (the compass, the boss
    // bar, the target's plate), then the veil over all.
    this.hurt = element('div', 'hurt', root);
    this.vitals = new Vitals(root);
    this.mark = element('div', 'mark', root);
    this.over = element('div', 'over', root);
    this.crosshair = element('div', 'crosshair', root);
    this.crosshair.hidden = true;
    element('div', 'charge', this.crosshair);
    const column = element('div', 'compass-column', root);
    this.compass = new Compass(column);
    this.foeBars = new FoeBars(root, this.over, column);
    this.target = new FoePlate(column, 'target', { poise: true, remembers: 'whole' });
    this.words = new Words(this.over);
    this.veil = element('div', 'veil', root);
  }

  update(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    this.flash(frame, seconds);
    const veil = veilOf(frame);
    this.veil.hidden = !veil;
    if (veil) {
      if (this.veil.textContent !== veil.words) this.veil.textContent = veil.words;
      this.veil.classList.toggle('link', veil.link);
    }
    const charge = frame.crosshair?.charge ?? null;
    this.crosshair.hidden = !frame.crosshair;
    this.crosshair.classList.toggle('charging', charge !== null);
    this.crosshair.classList.toggle('full', charge !== null && charge >= 1);
    this.crosshair.style.setProperty('--charge', `${Math.round(Math.min(1, charge ?? 0) * 360)}deg`);
    const overHead = (view: FighterView) => {
      const point = [view.x, view.y, view.z + RING_HEIGHT] as const;
      const spot = project(frame.matrix, point, frame.width, frame.height);
      return spot && { ...spot, depth: clipOf(frame.matrix, point)[2] };
    };
    const lock = own?.target ?? null;
    const chosen = this.foeTarget.step({ player: frame.player, lock, foes: frame.foes, events: frame.events }, seconds);
    const blocks = frame.blocks ?? [];
    const viewing: PlateViewing = {
      camera: cameraOf(frame.matrix),
      blocked: (from, to) => blockedBy(blocks, from, to),
      fought: (id) => this.foeTarget.foughtWith(id),
    };
    if (viewing.camera) this.compass.update(headingOf(viewing.camera.forward));
    const boss = this.foeBars.update(frame.foes, own, overHead, viewing, seconds);
    this.markTarget(frame, chosen, boss, seconds);
    this.vitals.update(own, seconds, this.staminaFlash > 0, !!chosen || !!boss);
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
      ring.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
      ring.style.setProperty('--span', `${span}px`);
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
    this.hurt.style.opacity = String(this.hurtFlash / FLASH_SECONDS);
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
    this.mark.hidden = !spot;
    if (spot) this.mark.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
    const foe = chosen && chosen.id !== boss?.id ? frame.foes.find((each) => each.id === chosen.id) : undefined;
    this.target.root.hidden = !foe;
    this.target.keep(new Set(frame.foes.map((each) => each.id)));
    if (!foe || !chosen) return;
    this.target.show(foe, seconds);
    this.target.root.style.opacity = chosen.share < 1 ? chosen.share.toFixed(2) : '';
  }

  /** An arrow at the screen's edge toward each foe off the screen at a blow or a draw meant for the player, until it
   *  ends, standing clear of the vitals' row. */
  private pointAtThreats(frame: HudFrame): void {
    const shown = new Set<number>();
    let row: { left: number; top: number; right: number; bottom: number } | null = null;
    for (const { id, view } of frame.foes) {
      if (!threatens(view, frame.player)) continue;
      const clip = clipOf(frame.matrix, [view.x, view.y, view.z + 1.1]);
      const edge = edgeArrow(clip, frame.width, frame.height, ARROW_INSET);
      if (!edge) continue;
      if (!row) {
        const [box, origin] = [this.vitals.root.getBoundingClientRect(), this.root.getBoundingClientRect()];
        const [left, top] = [box.left - origin.left, box.top - origin.top];
        row = { left, top, right: left + box.width, bottom: top + box.height };
      }
      const spot = clearOf(edge, row, ARROW_CLEAR);
      shown.add(id);
      const arrow = this.arrows.get(id) ?? element('div', 'arrow', this.over);
      this.arrows.set(id, arrow);
      arrow.style.transform = `translate(${spot.x}px, ${spot.y}px) rotate(${spot.angle}rad)`;
    }
    for (const [id, arrow] of this.arrows) {
      if (shown.has(id)) continue;
      arrow.remove();
      this.arrows.delete(id);
    }
  }

  /** The events' words, each rising and fading over where it happened (in first person, those on the player below the
   *  crosshair), and a warning over a foe near the player as it begins an iron wind-up. */
  private floatWords(frame: HudFrame, seconds: number): void {
    const holding = (id: number) => frame.foes.find((foe) => foe.id === id)?.view.action.kind === 'telegraph';
    for (const said of wordsOf(frame.events, frame.player, holding)) {
      const place = frame.where(said.defender);
      if (!place) continue;
      const own = frame.firstPerson && said.defender === frame.player;
      // What a shield took is said in its element's colour.
      const shield = said.tone === 'shield' ? frame.foes.find((foe) => foe.id === said.defender)?.shield : null;
      const told = shield ? { ...said, element: shield.element } : said;
      this.words.say(told, own ? null : [place[0], place[1], place[2] + 1.9]);
    }
    for (const { id, view } of frame.foes) {
      const iron = view.action.kind === 'telegraph' && view.action.iron;
      const near = !!frame.own && Math.hypot(view.x - frame.own.x, view.y - frame.own.y) <= IRON_NEAR_M;
      if (!iron) this.ironTold.delete(id);
      else if (near && !this.ironTold.has(id)) {
        this.ironTold.add(id);
        this.words.say({ text: 'Dodge!', tone: 'warn', tags: [] }, [view.x, view.y, view.z + 2.3], 0.5);
      }
    }
    const projectWord = (point: readonly [number, number, number]) =>
      project(frame.matrix, point, frame.width, frame.height);
    this.words.update(projectWord, frame.width, frame.height, seconds);
  }
}
