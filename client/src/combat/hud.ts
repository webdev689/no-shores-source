import type { FightEvent } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';

/** A foe as the display marks it: its number, its kind's name and its glance. */
export interface MarkedFoe {
  readonly id: number;
  readonly name: string;
  readonly view: FighterView;
}

/** What the display is drawn from each frame: the player's fighter, the foes, every fighter's place by number, how the
 *  camera projects a point, the canvas's size in CSS pixels, and the fight's events since the last frame. */
export interface HudFrame {
  readonly own: FighterView | null;
  readonly foes: readonly MarkedFoe[];
  readonly where: (id: number) => readonly [number, number, number] | null;
  readonly matrix: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly events: readonly FightEvent[];
  readonly player: number;
}

/** The room's events by their numbers (crates/room/src/judging.rs EventKind), and how a blow was struck (How). */
const EVENT = {
  hit: 1,
  blocked: 2,
  parried: 3,
  guardBroken: 4,
  dodged: 5,
  perfect: 6,
  staggered: 7,
  killed: 8,
  feinted: 10,
};
const HOW = { riposte: 2, counter: 3, iron: 5 };
/** Seconds a word floats over where it happened, and how far it rises in that time, in CSS pixels. */
const WORD_SECONDS = 1.1;
const WORD_RISE = 36;
/** A foe's bar shows over it this near, once it has been struck. */
const BAR_NEAR_M = 16;
/** How long the dead lie before standing again, in ticks (crates/combat/src/tuning.rs RESPAWN). */
const RESPAWN_TICKS = 240;

/** Where a point falls on the canvas in CSS pixels, or null behind the camera. */
export function project(matrix: Float32Array, point: readonly [number, number, number], width: number, height: number) {
  const [x, y, z] = point;
  const component = (row: number) =>
    (matrix[row] ?? 0) * x + (matrix[4 + row] ?? 0) * y + (matrix[8 + row] ?? 0) * z + (matrix[12 + row] ?? 0);
  const w = component(3);
  if (w <= 1e-6) return null;
  return { x: ((component(0) / w + 1) / 2) * width, y: ((1 - component(1) / w) / 2) * height };
}

/** A word for what an event came to, from whose side, and its colour's class; null for one nothing is said of. */
function wordOf(event: FightEvent, player: number): { text: string; tone: string } | null {
  const mine = event.striker === player;
  switch (event.kind) {
    case EVENT.hit: {
      const amount = Math.max(1, Math.round(event.amount));
      if (event.how === HOW.riposte) return { text: `Riposte ${amount}`, tone: 'great' };
      if (event.how === HOW.counter) return { text: `Counter ${amount}`, tone: 'great' };
      return { text: String(amount), tone: mine ? 'dealt' : 'taken' };
    }
    case EVENT.blocked:
      return { text: 'Blocked', tone: 'plain' };
    case EVENT.parried:
      return { text: mine ? 'Parried' : 'Parry!', tone: mine ? 'taken' : 'great' };
    case EVENT.guardBroken:
      return { text: 'Guard broken', tone: 'taken' };
    case EVENT.dodged:
      return { text: 'Dodged', tone: 'plain' };
    case EVENT.perfect:
      return { text: 'Perfect dodge!', tone: 'great' };
    case EVENT.staggered:
      return { text: 'Staggered', tone: mine ? 'great' : 'taken' };
    case EVENT.killed:
      return { text: 'Slain', tone: 'great' };
    case EVENT.feinted:
      return { text: 'Feint', tone: 'plain' };
    default:
      return null;
  }
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
  private readonly veil: HTMLElement;
  private readonly bars = new Map<number, Bar>();
  private words: { readonly element: HTMLElement; readonly at: readonly [number, number, number]; age: number }[] = [];

  constructor(root: HTMLElement) {
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
  }

  update(frame: HudFrame, seconds: number): void {
    const { own } = frame;
    this.health.set(own ? own.health / Math.max(1, own.healthMax) : 1);
    this.stamina.set(own ? own.stamina / 100 : 1);
    this.poise.set(own ? own.poise / Math.max(1, own.poiseMax) : 0);
    const dead = own?.action.kind === 'dead' ? own.action : null;
    this.veil.hidden = !dead;
    if (dead)
      this.veil.textContent = `You fell. Standing again in ${Math.ceil(Math.max(0, RESPAWN_TICKS - dead.elapsed) / 60)} s`;
    this.markTarget(frame);
    this.markFoes(frame);
    this.floatWords(frame, seconds);
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

  /** The events' words, each rising and fading over where it happened. */
  private floatWords(frame: HudFrame, seconds: number): void {
    for (const event of frame.events) {
      const word = wordOf(event, frame.player);
      const place = frame.where(event.defender);
      if (!word || !place) continue;
      const made = element('div', `word ${word.tone}`, this.over);
      made.textContent = word.text;
      this.words.push({ element: made, at: [place[0], place[1], place[2] + 1.9], age: 0 });
    }
    this.words = this.words.filter((word) => {
      word.age += seconds;
      const spot = project(frame.matrix, word.at, frame.width, frame.height);
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
