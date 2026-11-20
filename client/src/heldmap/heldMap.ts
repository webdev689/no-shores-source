// The held map at the helm: the parchment raised in the player's gauntlets, the discovered world on it, panned,
// zoomed and clicked to choose where to sail; lowered with or without a destination. The forge's art is the owner's
// own; its rules are DFO's held map's (heldMapLaw.ts).
import { button, make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { Gpu } from '../gpu.ts';
import { forgeName } from '../firstperson/fpFrames.ts';
import { WORLD_FRAME } from '../overworld/discovery.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { ForgeStore } from '../forge/store.ts';
import { type CoastField } from './coastField.ts';
import {
  CLOSE_S,
  nearestMark,
  OPEN_S,
  PAN_PX,
  raised,
  type Rect,
  routeOf,
  SHEET,
  stageOf,
  toInk,
  toWorld,
  type View,
  viewOn,
  wheelFactor,
  zoomAt,
} from './heldMapLaw.ts';
import { type HeldMapFrame, HeldMapView, ROUTE_POINTS } from './heldMapView.ts';
import { HeldMapWaters, ruinedPlaces } from './heldMapWaters.ts';
import {
  type KeyPlace,
  keyPlace,
  keySize,
  keyWidths,
  landUnder,
  LETTER_FONT,
  letterBox,
  type Lettering,
  type MapLetter,
  paintLettering,
} from './mapLetters.ts';
import type { MapWaters } from './watersWash.ts';

/** The world's frame, metres. */
const WORLD = { width: WORLD_FRAME.widthM, height: WORLD_FRAME.heightM } as const;
/** The forge's held-map art: the parchment, and the gauntlets' strips of 17 frames, one a set and one bare. */
const SHEET_PATH = '@art/held-map-forge-sheet.png';
const HANDS_FRAMES = 17;
const handsPath = (gauntlets: string | null) =>
  `@art/held-map-forge-hands${gauntlets ? `-${forgeName(gauntlets)}` : ''}.png`;
/** The gauntlets' fidget: the fingers of each hand flex in turn, every few seconds, a frame each twelfth of a second. */
const FIDGET = { every: 6, frameS: 1 / 12 } as const;

/** Something the map shows, once discovered: a port or a node, where it lies, what it is, and where a ship sails for
 *  it (a node's nearest coast). */
export interface MapPlace {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly at: Point2;
  readonly sail: Point2;
}

/** A route as the map inks it, or why there is none. */
export type Course =
  { readonly ok: true; readonly points: readonly Point2[] } | { readonly ok: false; readonly why: string };

/** What the map is asked each frame: where the ship lies and heads, what is discovered, and the course sailed now. */
export interface HeldMapScene {
  readonly ship: Point2;
  readonly heading: number;
  readonly places: readonly MapPlace[];
  readonly knownIslands: number;
  readonly course: readonly Point2[];
}

type Phase =
  | { readonly kind: 'closed' }
  | { readonly kind: 'opening'; readonly t: number }
  | { readonly kind: 'open' }
  | { readonly kind: 'closing'; readonly t: number; readonly from: number; readonly sail: Point2 | null };

type Choice = { readonly at: Point2; readonly name: string; readonly course: Course; readonly place: string | null };

/** The difficulty a voyage sets out at: its island's foes as they are, or raised, paying more. */
export type Difficulty = 'calm' | 'rough' | 'storm';
const DIFFICULTY_WORDS: readonly (readonly [Difficulty, string, string])[] = [
  ['calm', 'Calm', 'The island’s foes as they are.'],
  ['rough', 'Rough', 'Foes two levels higher; half again the XP, Aurem and Vestiges.'],
  ['storm', 'Storm', 'Foes three levels higher; twice the XP, Aurem and Vestiges.'],
];

export class HeldMap {
  private readonly view: HeldMapView;
  private readonly store: ForgeStore;
  private readonly plan: (to: Point2) => Course;
  private readonly layer = make('div', '', 'held-map');
  private readonly card = make('div', '', 'held-card');
  /** The parchment's picture its words, marks and key are painted on, laid down with its ink under the hands. */
  private readonly lettering: HTMLCanvasElement;
  private readonly painter: CanvasRenderingContext2D;
  private readonly field: CoastField;
  private key: KeyPlace | null = null;
  private letteredShape = '';
  private phase: Phase = { kind: 'closed' };
  private mapView: View = { left: 0, top: 0, scale: 1 };
  private ink: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private press: { x: number; y: number; view: View; panning: boolean } | null = null;
  private choice: Choice | null = null;
  /** The difficulty the voyage set out at: what the card showed when the player set sail. */
  difficulty: Difficulty = 'calm';
  /** The difficulty chosen on the card, kept only once the player sets sail with it. */
  private picked: Difficulty = 'calm';
  private placed: { readonly place: MapPlace; readonly x: number; readonly y: number }[] = [];
  private gauntlets: string | null | undefined = undefined;
  private clock = 0;
  private lowered: (sail: Point2 | null) => void = () => undefined;
  /** The waters once they are open: their wash, letters and key, and which cities are ports. */
  private waters: HeldMapWaters | null = null;
  private charted: Uint8Array | null = null;

  constructor(gpu: Gpu, field: CoastField, store: ForgeStore, plan: (to: Point2) => Course, root: HTMLElement) {
    this.view = new HeldMapView(gpu, field);
    this.field = field;
    this.store = store;
    this.plan = plan;
    this.layer.append(this.card);
    this.layer.hidden = true;
    root.append(this.layer);
    this.lettering = root.ownerDocument.createElement('canvas');
    const painter = this.lettering.getContext('2d');
    if (!painter) throw new Error('the held map has no 2D canvas to letter on');
    this.painter = painter;
  }

  /** The waters, opened once a page: the map tints, letters and keys them from now on, and marks the ruins. */
  setWaters(waters: MapWaters): void {
    this.waters = new HeldMapWaters(waters);
    if (this.charted) this.view.setWash(this.waters.chart(this.charted));
  }

  /** Whether the map is up, rising or lowering: the sea's own input waits while it is. */
  get shown(): boolean {
    return this.phase.kind !== 'closed';
  }

  /** What happens once the map is lowered: the ship sets sail for its destination, or none was chosen. */
  onLowered(then: (sail: Point2 | null) => void): void {
    this.lowered = then;
  }

  /** Raises the map in the player's gauntlets (`null` bare hands), centred on the ship, the sea charted so far laid on
   *  it. */
  open(
    viewport: { readonly width: number; readonly height: number },
    ship: Point2,
    gauntlets: string | null,
    charted: Uint8Array,
  ): void {
    if (this.phase.kind !== 'closed') return;
    if (gauntlets !== this.gauntlets) this.load(gauntlets);
    this.view.setCharted(charted);
    this.charted = charted;
    if (this.waters) this.view.setWash(this.waters.chart(charted));
    this.ink = stageOf(viewport).ink;
    this.mapView = viewOn(ship, this.ink, WORLD);
    this.choice = null;
    this.phase = { kind: 'opening', t: 0 };
    this.layer.hidden = false;
  }

  /** Lowers the map from wherever it is in its rise; `sail` is the destination set, or null. */
  close(sail: Point2 | null = null): void {
    const phase = this.phase;
    if (phase.kind === 'closed' || phase.kind === 'closing') return;
    const from = phase.kind === 'opening' ? raised(phase.t / OPEN_S) : 1;
    this.phase = { kind: 'closing', t: 0, from, sail };
  }

  /** Reads the art for a set of gauntlets. Art that will not come lets the map go, and is asked for again the next
   *  time the map is raised. */
  private load(gauntlets: string | null): void {
    this.gauntlets = gauntlets;
    const failed = (why: unknown) => {
      console.error('the held map could not be read:', why);
      this.gauntlets = undefined;
      this.close();
    };
    void Promise.all([this.store.strip(SHEET_PATH), this.store.strip(handsPath(gauntlets))])
      .then(async ([sheet, hands]) => {
        // A set the forge drew no hands for holds the map in bare hands.
        const held = hands ?? (gauntlets ? await this.store.strip(handsPath(null)) : null);
        if (this.gauntlets !== gauntlets) return;
        if (sheet && held) this.view.setPictures(sheet, held, HANDS_FRAMES);
        else failed('the forge has no held-map art');
      })
      .catch(failed);
  }

  /** A press that ends anywhere else is forgotten. */
  pointerCancel(): void {
    this.press = null;
  }

  pointerDown(x: number, y: number): void {
    if (this.phase.kind === 'open') this.press = { x, y, view: this.mapView, panning: false };
  }

  pointerMove(x: number, y: number): void {
    const press = this.press;
    if (!press) return;
    if (!press.panning && Math.abs(x - press.x) + Math.abs(y - press.y) <= PAN_PX) return;
    press.panning = true;
    const moved = {
      ...press.view,
      left: press.view.left - (x - press.x) / press.view.scale,
      top: press.view.top - (y - press.y) / press.view.scale,
    };
    this.mapView = zoomAt(moved, 0, 0, 1, this.ink, WORLD);
  }

  /** A press let go: a click picks the nearest discovered place, or the point of the sea under it. */
  pointerUp(x: number, y: number): void {
    const press = this.press;
    this.press = null;
    if (!press || press.panning || this.phase.kind !== 'open') return;
    const [inkX, inkY] = [x - this.ink.x, y - this.ink.y];
    if (inkX < 0 || inkY < 0 || inkX > this.ink.width || inkY > this.ink.height) return;
    const mark = nearestMark(this.placed, inkX, inkY);
    const point = mark ? mark.place.sail : (toWorld(this.mapView, inkX, inkY) as Point2);
    this.choice = {
      at: point,
      name: mark ? mark.place.name : 'This stretch of sea',
      course: this.plan(point),
      place: mark?.place.id ?? null,
    };
  }

  /** The wheel at a point on the screen: the map zooms about it. */
  wheel(x: number, y: number, deltaY: number, deltaMode: number): void {
    if (this.phase.kind !== 'open') return;
    const factor = wheelFactor(deltaY, deltaMode, this.ink.height);
    this.mapView = zoomAt(this.mapView, x - this.ink.x, y - this.ink.y, factor, this.ink, WORLD);
  }

  /** Sets sail for the destination chosen, if it has a course. */
  setSail(): void {
    if (!this.choice?.course.ok) return;
    this.difficulty = this.picked;
    this.close(this.choice.at);
  }

  /** Escape: the choice is let go first, with the seas picked on its card, then the map lowered. */
  escape(): void {
    if (this.choice) {
      this.choice = null;
      this.picked = this.difficulty;
    } else this.close();
  }

  /** One frame, `dt` seconds on: the map's rise, its view and its marks laid out, and what its view draws, device
   *  pixels (`dpr` a CSS pixel). Null while it is down or its art has not come. */
  frame(
    dt: number,
    viewport: { readonly width: number; readonly height: number },
    dpr: number,
    scene: HeldMapScene,
  ): HeldMapFrame | null {
    this.clock += dt;
    // The rise waits for the art the first time it is asked for; lowering never waits.
    const waiting = !this.view.ready && this.phase.kind === 'opening';
    const lift = this.advance(waiting ? 0 : dt);
    this.layer.hidden = lift === null || !this.view.ready;
    if (lift === null || !this.view.ready) return null;
    const stage = stageOf(viewport);
    if (stage.ink.width !== this.ink.width || stage.ink.height !== this.ink.height)
      this.mapView = zoomAt(this.mapView, 0, 0, 1, stage.ink, WORLD);
    const drop = (1 - lift) * stage.sprite.height;
    this.ink = stage.ink;
    const scaled = (rect: Rect, down: number): Rect => ({
      x: rect.x * dpr,
      y: (rect.y + down) * dpr,
      width: rect.width * dpr,
      height: rect.height * dpr,
    });
    const { sprite } = stage;
    const parchment = {
      x: sprite.x + SHEET.x0 * sprite.width,
      y: sprite.y + SHEET.y0 * sprite.height,
      width: (SHEET.x1 - SHEET.x0) * sprite.width,
      height: (SHEET.y1 - SHEET.y0) * sprite.height,
    };
    const picture = scaled(parchment, drop);
    const [width, height] = [Math.ceil(picture.width), Math.ceil(picture.height)];
    if (this.lettering.width !== width || this.lettering.height !== height)
      [this.lettering.width, this.lettering.height] = [width, height];
    const inkAt = { x: stage.ink.x - parchment.x, y: stage.ink.y - parchment.y };
    const margin = parchment.y + parchment.height - (stage.ink.y + stage.ink.height);
    this.layer.style.opacity = String(lift);
    const lettering = this.layout(scene, drop, margin);
    // Painted and sent to the device only when what is lettered, where, or its face's loading has changed.
    const fonts = this.lettering.ownerDocument.fonts.status;
    const shape = JSON.stringify([width, height, inkAt, dpr, fonts, lettering]);
    const letteringChanged = shape !== this.letteredShape;
    if (letteringChanged) paintLettering(this.painter, this.lettering, inkAt, dpr, lettering);
    this.letteredShape = shape;
    return {
      parchment: picture,
      lettering: this.lettering,
      letteringChanged,
      screen: { width: viewport.width * dpr, height: viewport.height * dpr },
      sprite: scaled(stage.sprite, drop),
      ink: scaled(stage.ink, drop),
      view: { left: this.mapView.left, top: this.mapView.top, scale: this.mapView.scale * dpr },
      handsFrame: this.fidget(),
      knownIslands: scene.knownIslands,
      route: routeOf(this.choice?.course.ok ? this.choice.course.points : scene.course, ROUTE_POINTS),
    };
  }

  /** Draws what `frame` worked out over the finished picture. */
  draw(encoder: GPUCommandEncoder, target: GPUTextureView, frame: HeldMapFrame): void {
    this.view.draw(encoder, target, frame);
  }

  /** Moves the rise on; answers how far up the map is, or null once it is down. */
  private advance(dt: number): number | null {
    const phase = this.phase;
    if (phase.kind === 'closed') return null;
    if (phase.kind === 'open') return 1;
    const t = phase.t + dt;
    if (phase.kind === 'opening') {
      this.phase = t >= OPEN_S ? { kind: 'open' } : { kind: 'opening', t };
      return raised(t / OPEN_S);
    }
    if (t >= CLOSE_S) {
      this.phase = { kind: 'closed' };
      this.press = null;
      this.lowered(phase.sail);
      return null;
    }
    this.phase = { ...phase, t };
    return phase.from * raised(1 - t / CLOSE_S);
  }

  /** The gauntlets' frame now: at rest, but for a flex of each hand's fingers every few seconds. */
  private fidget(): number {
    const into = this.clock % FIDGET.every;
    const frame = Math.floor(into / FIDGET.frameS);
    return frame < HANDS_FRAMES ? frame : 0;
  }

  /** What is lettered on the map this frame: each place on it and each charted water named, the ship's arrow and the
   *  key, laid where it covers no land, word or mark; and the card over the parchment, `drop` pixels down its
   *  lowering. */
  private layout(scene: HeldMapScene, drop: number, margin: number): Lettering {
    const onSheet = (x: number, y: number) => x >= 0 && y >= 0 && x <= this.ink.width && y <= this.ink.height;
    this.painter.font = LETTER_FONT;
    const widthOf = (text: string) => this.painter.measureText(text).width;
    this.placed = [];
    const letters: MapLetter[] = [];
    for (const place of ruinedPlaces(scene.places, this.waters?.waters.mainPorts ?? null)) {
      const [x, y] = toInk(this.mapView, place.at[0], place.at[1]);
      if (!onSheet(x, y)) continue;
      this.placed.push({ place, x, y });
      letters.push({ text: place.name, x, y, kind: place.kind, chosen: this.choice?.place === place.id });
    }
    letters.push(...(this.waters?.letters(this.ink, (x, y) => toInk(this.mapView, x, y), widthOf) ?? []));
    const [shipX, shipY] = toInk(this.mapView, scene.ship[0], scene.ship[1]);
    const ship = onSheet(shipX, shipY) ? { x: shipX, y: shipY, heading: scene.heading } : null;
    const taken = letters.map((letter) => letterBox(letter, widthOf(letter.text)));
    if (ship) taken.push({ x: ship.x - 10, y: ship.y - 10, width: 20, height: 20 });
    const widths = keyWidths(this.painter);
    const land = (box: Rect) => landUnder(this.field, scene.knownIslands, this.mapView, box);
    this.key = this.waters
      ? keyPlace({ ...this.ink, margin }, keySize(widths.words, widths.ramp), widths.row, taken, land, this.key)
      : null;
    this.layoutCard(drop);
    return { letters, ship, key: this.key };
  }

  private layoutCard(drop: number): void {
    const choice = this.choice;
    this.card.hidden = !choice;
    if (!choice) return;
    const words = choice.course.ok ? `Set a course for ${choice.name}` : choice.course.why;
    const shape = `${words} ${this.picked}`;
    if (this.card.dataset['words'] !== shape) {
      this.card.dataset['words'] = shape;
      const sail = button('Set sail  Enter', () => this.setSail());
      sail.classList.add(ROLES.primary);
      sail.hidden = !choice.course.ok;
      const seas = make('div', '', 'held-card-seas');
      seas.hidden = !choice.course.ok;
      for (const [difficulty, label, said] of DIFFICULTY_WORDS) {
        const pick = button(label, () => (this.picked = difficulty));
        pick.classList.add(ROLES[difficulty === this.picked ? 'primary' : 'button']);
        pick.title = said;
        seas.append(pick);
      }
      this.card.replaceChildren(make('div', words, 'held-card-words'), seas, sail);
    }
    this.card.style.transform = `translate(${this.ink.x + this.ink.width / 2}px, ${this.ink.y + drop - 12}px) translate(-50%, -100%)`;
  }
}
