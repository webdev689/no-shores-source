import type { FightEvent } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { edgeArrow, parryCue, threatens, wordOf } from './cues.ts';

/** A foe as the display marks it: its number, its kind's name and its glance (its place as it is drawn). */
export interface MarkedFoe {
  readonly id: number;
  readonly name: string;
  readonly view: FighterView;
}

/** What the display is drawn from each frame: the player's fighter, the foes, every fighter's place by number, how the
 *  camera projects a point, the canvas's size in CSS pixels, the fight's events since the last frame, whether the view
 *  is the player's own eyes, whether a swing or a dodge was pressed since the last frame, and why the link to the room
 *  was lost (null while it holds). */
export interface HudFrame {
  readonly own: FighterView | null;
  readonly foes: readonly MarkedFoe[];
  readonly where: (id: number) => readonly [number, number, number] | null;
  readonly matrix: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly events: readonly FightEvent[];
  readonly player: number;
  readonly firstPerson: boolean;
  readonly pressed: boolean;
  readonly lost: string | null;
  /** The crosshair, while a ranged weapon aims or is out in first person, with a bow's charge (0 to 1) while it aims. */
  readonly crosshair?: { readonly charge: number | null } | null;
  /** Whether a press of the player's guard now could open a parry window (Fighting's parryOpen). */
  readonly parryOpen?: boolean;
}

/** Seconds a word floats over where it happened, and how far it rises in that time, in CSS pixels. */
const WORD_SECONDS = 1.1;
const WORD_RISE = 36;
/** In first person, a word on the player stands this far below the crosshair, the next ones each a line lower. */
const OWN_WORD_BELOW = 56;
const OWN_WORD_LINE = 22;
/** A foe's bar shows over it this near, once it has been struck. */
const BAR_NEAR_M = 16;
/** A foe winding up an iron blow this near is told to be dodged. */
const IRON_NEAR_M = 12;
/** How long the dead lie before standing again, in ticks (crates/combat/src/tuning.rs RESPAWN). */
const RESPAWN_TICKS = 240;
/** How long the stamina bar flashes for a swing or a dodge asked with none, and the screen's edge for a blow taken. */
const FLASH_SECONDS = 0.45;
/** How far inside the canvas's edge an arrow to a foe off the screen stands, in CSS pixels. */
const ARROW_INSET = 28;
/** A parry ring's span as a blow begins and as it lands (its fixed inner ring's), in CSS pixels; and how high over
 *  the foe's feet it stands, in metres. */
const RING_WIDEST = 56;
const RING_CLOSED = 14;
const RING_HEIGHT = 2.5;

/** A point's clip coordinates through the camera: x, y up, and w (0 or less behind it). */
function clipOf(matrix: Float32Array, point: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = point;
  const component = (row: number) =>
    (matrix[row] ?? 0) * x + (matrix[4 + row] ?? 0) * y + (matrix[8 + row] ?? 0) * z + (matrix[12 + row] ?? 0);
  return [component(0), component(1), component(3)];
}

/** Where a point falls on the canvas in CSS pixels, or null behind the camera. */
export function project(matrix: Float32Array, point: readonly [number, number, number], width: number, height: number) {
  const [clipX, clipY, clipW] = clipOf(matrix, point);
  if (clipW <= 1e-6) return null;
  return { x: ((clipX / clipW + 1) / 2) * width, y: ((1 - clipY / clipW) / 2) * height };
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const made = document.createElement(tag);
  made.className = className;
  parent.append(made);
  return made;
}

/** A labelled bar: its fill set as a share. */
class Bar {
  readonly root: HTMLElement;
  private readonly fill: HTMLElement;

  constructor(parent: HTMLElement, kind: string) {
    this.root = element('div', `bar ${kind}`, parent);
    this.fill = element('div', 'fill', this.root);
  }

  set(share: number): void {
    this.fill.style.width = `${Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10}%`;
  }
}

/** A word floating up and fading: over a place in the world, or (null) at the player's own spot in first person. */
interface Word {
  readonly element: HTMLElement;
  readonly at: readonly [number, number, number] | null;
  readonly line: number;
  age: number;
}

/** The fight's display over the canvas. */
export class Hud {
  private readonly health: Bar;
  private readonly stamina: Bar;
  private readonly poise: Bar;
  private readonly target: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetHealth: Bar;
  private readonly targetPoise: Bar;
  private readonly mark: HTMLElement;
  private readonly over: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly bars = new Map<number, Bar>();
  private readonly arrows = new Map<number, HTMLElement>();
  private readonly rings = new Map<number, HTMLElement>();
  /** The foes whose iron wind-up the player has been told of, until it ends. */
  private readonly ironTold = new Set<number>();
  private words: Word[] = [];
  private staminaFlash = 0;
  private hurtFlash = 0;

  constructor(root: HTMLElement) {
    this.hurt = element('div', 'hurt', root);
    const own = element('div', 'own', root);
    this.health = new Bar(own, 'health');
    this.stamina = new Bar(own, 'stamina');
    this.poise = new Bar(own, 'poise');
    this.target = element('div', 'target', root);
    this.targetName = element('div', 'name', this.target);
    this.targetHealth = new Bar(this.target, 'health');
    this.targetPoise = new Bar(this.target, 'poise');
    this.mark = element('div', 'mark', root);
    this.over = element('div', 'over', root);
    this.veil = element('div', 'veil', root);
    this.crosshair = element('div', 'crosshair', root);
    this.crosshair.hidden = true;
    element('div', 'charge', this.crosshair);
  }

  update(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    this.health.set(own ? own.health / Math.max(1, own.healthMax) : 1);
    this.stamina.set(own ? own.stamina / 100 : 1);
    this.poise.set(own ? own.poise / Math.max(1, own.poiseMax) : 0);
    this.flash(frame, seconds);
    const dead = own?.action.kind === 'dead' ? own.action : null;
    this.veil.hidden = !dead && frame.lost === null;
    if (frame.lost !== null) this.veil.textContent = `The link to the room was lost: ${frame.lost}.`;
    else if (dead)
      this.veil.textContent = `You fell. Standing again in ${Math.ceil(Math.max(0, RESPAWN_TICKS - dead.elapsed) / 60)} s`;
    const charge = frame.crosshair?.charge ?? null;
    this.crosshair.hidden = !frame.crosshair;
    this.crosshair.classList.toggle('charging', charge !== null);
    this.crosshair.classList.toggle('full', charge !== null && charge >= 1);
    this.crosshair.style.setProperty('--charge', `${Math.round(Math.min(1, charge ?? 0) * 360)}deg`);
    this.markTarget(frame);
    this.markFoes(frame);
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
    this.stamina.root.classList.toggle('flash', this.staminaFlash > 0);
    this.hurt.style.opacity = String(this.hurtFlash / FLASH_SECONDS);
  }

  /** The soft lock's target: a mark at its chest and its bars at the top. */
  private markTarget(frame: HudFrame): void {
    const target = frame.own?.target ?? null;
    const foe = frame.foes.find((each) => each.id === target);
    this.target.hidden = !foe;
    if (!foe) {
      this.mark.hidden = true;
      return;
    }
    this.targetName.textContent = foe.name;
    this.targetHealth.set(foe.view.health / Math.max(1, foe.view.healthMax));
    this.targetPoise.set(foe.view.poise / Math.max(1, foe.view.poiseMax));
    const spot = project(frame.matrix, [foe.view.x, foe.view.y, foe.view.z + 1.1], frame.width, frame.height);
    this.mark.hidden = !spot;
    if (spot) this.mark.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
  }

  /** A small bar over each foe near the player that has been struck. */
  private markFoes(frame: HudFrame): void {
    const shown = new Set<number>();
    for (const foe of frame.foes) {
      const { view } = foe;
      const near = frame.own ? Math.hypot(view.x - frame.own.x, view.y - frame.own.y) <= BAR_NEAR_M : false;
      if (!near || view.health >= view.healthMax || view.action.kind === 'dead' || foe.id === frame.own?.target)
        continue;
      const spot = project(frame.matrix, [view.x, view.y, view.z + 2.1], frame.width, frame.height);
      if (!spot) continue;
      shown.add(foe.id);
      const bar = this.bars.get(foe.id) ?? new Bar(this.over, 'health small');
      this.bars.set(foe.id, bar);
      bar.set(view.health / Math.max(1, view.healthMax));
      bar.root.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
    }
    for (const [id, bar] of this.bars) {
      if (shown.has(id)) continue;
      bar.root.remove();
      this.bars.delete(id);
    }
  }

  /** An arrow at the screen's edge toward each foe off the screen at a blow or a draw meant for the player, until it
   *  ends. */
  private pointAtThreats(frame: HudFrame): void {
    const shown = new Set<number>();
    for (const { id, view } of frame.foes) {
      if (!threatens(view, frame.player)) continue;
      const clip = clipOf(frame.matrix, [view.x, view.y, view.z + 1.1]);
      const spot = edgeArrow(clip, frame.width, frame.height, ARROW_INSET);
      if (!spot) continue;
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

  private say(text: string, tone: string, place: Word['at']): void {
    const made = element('div', `word ${tone}`, this.over);
    made.textContent = text;
    const line = place ? 0 : this.words.filter((word) => !word.at).length;
    this.words.push({ element: made, at: place, line, age: 0 });
  }

  /** The events' words, each rising and fading over where it happened (in first person, those on the player below the
   *  crosshair), and a warning over a foe near the player as it begins an iron wind-up. */
  private floatWords(frame: HudFrame, seconds: number): void {
    for (const event of frame.events) {
      const word = wordOf(event, frame.player);
      const place = frame.where(event.defender);
      if (!word || !place) continue;
      const own = frame.firstPerson && event.defender === frame.player;
      this.say(word.text, word.tone, own ? null : [place[0], place[1], place[2] + 1.9]);
    }
    for (const { id, view } of frame.foes) {
      const iron = view.action.kind === 'telegraph' && view.action.iron;
      const near = !!frame.own && Math.hypot(view.x - frame.own.x, view.y - frame.own.y) <= IRON_NEAR_M;
      if (!iron) this.ironTold.delete(id);
      else if (near && !this.ironTold.has(id)) {
        this.ironTold.add(id);
        this.say('Dodge!', 'warn', [view.x, view.y, view.z + 2.3]);
      }
    }
    this.words = this.words.filter((word) => {
      word.age += seconds;
      const ownSpot = { x: frame.width / 2, y: frame.height / 2 + OWN_WORD_BELOW + word.line * OWN_WORD_LINE };
      const spot = word.at ? project(frame.matrix, word.at, frame.width, frame.height) : ownSpot;
      if (word.age >= WORD_SECONDS || !spot) {
        word.element.remove();
        return false;
      }
      const share = word.age / WORD_SECONDS;
      word.element.style.transform = `translate(${spot.x}px, ${spot.y - share * WORD_RISE}px)`;
      word.element.style.opacity = String(1 - share * share);
      return true;
    });
  }
}
