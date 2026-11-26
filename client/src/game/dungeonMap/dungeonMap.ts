// The dungeon map as the player holds it: opened with the land map's key in a dungeon, it covers the view with the
// dungeon inked on parchment. It keeps the dungeon's reveal as the player walks, opened or not, and each dungeon's view
// and reveal in the browser's storage. Its keys turn and tilt it, lay the plan, zoom and pan, and step the storey it is
// cut over or show them all; a drag pans and a right drag turns, and the wheel zooms at the pointer.
import type { DungeonLayout } from '../dungeonLayout.ts';
import {
  dragTurn,
  eased,
  type MapView,
  ORBIT,
  panned,
  planned,
  restView,
  tilted,
  toPaper,
  turned,
  zoomedAt,
} from './mapCamera.ts';
import { readKept, writeKept } from './mapKept.ts';
import { Reveal } from './mapReveal.ts';
import { cellIndex, kindAt, storeyOfHeight, type Storeys, storeysOf } from './mapStoreys.ts';

type Point = readonly [number, number, number];
type Size = { readonly width: number; readonly height: number };

/** How far an arrow key pans (CSS px), how often a changed reveal is kept (s), and how near a mark the pointer
 *  names it (CSS px). */
const PAN_PX = 60;
const KEEP_EVERY_S = 3;
const NAME_PX = 14;

/** Someone on the map: where they stand, which way they face (radians clockwise from north) and their name. */
export interface MapBody {
  readonly feet: Point;
  readonly facing: number;
  readonly name: string;
}

/** A mark on the paper: what it is, where (CSS px from the paper's top left), which way it points (radians clockwise
 *  from up), its name where the pointer is over it, and whether it stands on another storey than the one looked at. */
export interface PaperMark {
  readonly kind: 'player' | 'company' | 'wayIn' | 'portal' | 'stairs';
  readonly x: number;
  readonly y: number;
  readonly turn: number;
  readonly name: string | null;
  readonly faint: boolean;
}

/** What one frame of the map shows: the view, the storey looked at and the player's, whether all show, the marks. */
export interface MapShown {
  readonly view: MapView;
  readonly storey: number;
  readonly playerStorey: number;
  readonly count: number;
  readonly every: boolean;
  readonly marks: readonly PaperMark[];
}

/** One dungeon's map, from going in to coming out. */
class Walked {
  readonly key: string;
  readonly layout: DungeonLayout;
  readonly storeys: Storeys;
  readonly reveal: Reveal;
  view: MapView | null;
  words: Uint32Array;
  /** Cells found since the ink's words were last laid, and since the reveal was last kept. */
  changed = true;
  unkept = false;
  sinceKept = 0;

  constructor(key: string, layout: DungeonLayout) {
    const kept = readKept(key);
    this.key = key;
    this.layout = layout;
    this.storeys = storeysOf(layout);
    this.reveal = new Reveal(layout, this.storeys, kept?.cells ?? []);
    this.view = kept?.view ?? null;
    this.words = new Uint32Array(this.storeys.count * this.storeys.plane);
  }

  /** Each cell's word for the ink: 1 walked or seen, 2 a flight's. */
  wordsNow(): Uint32Array {
    if (!this.changed) return this.words;
    this.changed = false;
    const { layout, storeys } = this;
    for (let storey = 0; storey < storeys.count; storey++)
      for (let row = 0; row < layout.rows; row++)
        for (let column = 0; column < layout.columns; column++) {
          const index = cellIndex(layout, storey, column, row);
          const flight = kindAt(layout, storeys, storey, column, row) === 'stair' ? 2 : 0;
          this.words[index] = (this.reveal.cells.has(index) ? 1 : 0) | flight;
        }
    return this.words;
  }

  keep(): void {
    writeKept(this.key, { view: this.view, cells: [...this.reveal.cells] });
    this.sinceKept = 0;
    this.unkept = false;
  }
}

export class DungeonMap {
  private walked: Walked | null = null;
  private up = false;
  private goal: MapView | null = null;
  private shown: MapView | null = null;
  private beforePlan: MapView | null = null;
  private storey = 0;
  private every = false;
  private player: MapBody | null = null;
  private paper: Size = { width: 1, height: 1 };
  private pointer: { x: number; y: number; button: number | null } = { x: -1, y: -1, button: null };

  /** Whether the map covers the view. */
  get open(): boolean {
    return this.up && this.walked !== null;
  }

  /** The dungeon being walked, for the ink. */
  get dungeon(): { readonly layout: DungeonLayout; readonly words: Uint32Array; readonly storeys: Storeys } | null {
    const walked = this.walked;
    return walked && { layout: walked.layout, words: walked.wordsNow(), storeys: walked.storeys };
  }

  /** Walks the dungeon `key` from now on; another dungeon's map is kept and let go. */
  enter(key: string, layout: DungeonLayout): void {
    if (this.walked?.key === key && this.walked.layout === layout) return;
    this.leave();
    this.walked = new Walked(key, layout);
  }

  /** Out of any dungeon: its map kept, and shut. */
  leave(): void {
    if (this.walked) {
      this.walked.view = this.goal ?? this.walked.view;
      this.walked.keep();
    }
    [this.walked, this.up, this.goal, this.shown, this.beforePlan] = [null, false, null, null, null];
  }

  /** `seconds` on, the player at `player`: the reveal kept up, and kept now and then once it changes. */
  tick(player: MapBody, seconds: number): void {
    const walked = this.walked;
    this.player = player;
    if (!walked) return;
    if (walked.reveal.tick(player.feet, seconds)) [walked.changed, walked.unkept] = [true, true];
    walked.sinceKept += seconds;
    if (walked.unkept && walked.sinceKept >= KEEP_EVERY_S) walked.keep();
  }

  /** Opens the map over the view, at the player's storey, on the view it was left at or at rest; or shuts it. */
  toggle(): void {
    const walked = this.walked;
    if (!walked || this.up) return this.shut();
    [this.up, this.beforePlan] = [true, null];
    this.pointerUp();
    const feet = this.player?.feet ?? [0, 0, 0];
    this.storey = storeyOfHeight(walked.storeys, feet[2]);
    const floor = walked.storeys.floors[this.storey] ?? 0;
    const explored = [...walked.reveal.cells].map((index) => this.middleOf(index));
    const rest = restView(explored, [feet[0], feet[1], floor], this.paper, {
      yaw: ORBIT.yawRest,
      pitch: ORBIT.pitchRest,
    });
    const kept = walked.view;
    this.goal = kept ? { ...kept, centre: [kept.centre[0], kept.centre[1], floor] } : rest;
    this.shown = this.goal;
  }

  private shut(): void {
    this.up = false;
    if (this.walked) {
      this.walked.view = this.goal;
      this.walked.keep();
    }
  }

  /** A cell's middle, on its storey's floor. */
  private middleOf(index: number): Point {
    const { layout, storeys } = this.walked as Walked;
    const storey = Math.floor(index / storeys.plane);
    const plane = index - storey * storeys.plane;
    const [column, row] = [plane % layout.columns, Math.floor(plane / layout.columns)];
    return [(column + 0.5) * layout.cell, (row + 0.5) * layout.cell, storeys.floors[storey] ?? 0];
  }

  /** The storey looked at stepped by `step` (1 down), the view shifted so the new floor lands where the old one was. */
  private stepStorey(step: number): void {
    const walked = this.walked;
    if (!walked || !this.goal) return;
    this.storey = Math.min(walked.storeys.count - 1, Math.max(0, this.storey + step));
    const floor = walked.storeys.floors[this.storey] ?? 0;
    this.goal = { ...this.goal, centre: [this.goal.centre[0], this.goal.centre[1], floor] };
    if (this.shown) this.shown = { ...this.shown, centre: [this.shown.centre[0], this.shown.centre[1], floor] };
  }

  /** Back to the player's storey, centred on them. */
  private home(): void {
    const walked = this.walked;
    const feet = this.player?.feet;
    if (!walked || !feet || !this.goal) return;
    this.storey = storeyOfHeight(walked.storeys, feet[2]);
    this.goal = { ...this.goal, centre: [feet[0], feet[1], walked.storeys.floors[this.storey] ?? 0] };
  }

  /** A key pressed while the map is up (named as `keyNameOf` names it): the map's own; `shut` keys close it. Every key
   *  is the map's while it is up, so none acts in the game behind it. */
  key(key: string, shut: readonly string[]): boolean {
    if (!this.open || !this.goal) return false;
    const goal = this.goal;
    const middle: readonly [number, number] = [0, 0];
    const pans: Record<string, readonly [number, number]> = {
      arrowleft: [PAN_PX, 0],
      arrowright: [-PAN_PX, 0],
      arrowup: [0, PAN_PX],
      arrowdown: [0, -PAN_PX],
    };
    const pan = pans[key];
    if (key === 'escape' || shut.includes(key)) this.shut();
    else if (key === 'q' || key === 'e') this.goal = turned(goal, key === 'q' ? -1 : 1);
    else if (key === 'r' || key === 'f') this.goal = tilted(goal, key === 'r' ? 1 : -1);
    else if (key === 'p') ({ view: this.goal, before: this.beforePlan } = planned(goal, this.beforePlan));
    else if (key === '+' || key === '=') this.goal = zoomedAt(goal, ORBIT.zoomStep, middle);
    else if (key === '-') this.goal = zoomedAt(goal, 1 / ORBIT.zoomStep, middle);
    else if (pan) this.goal = panned(goal, pan);
    else if (key === 'pageup' || key === ']') this.stepStorey(-1);
    else if (key === 'pagedown' || key === '[') this.stepStorey(1);
    else if (key === 'l') this.every = !this.every;
    else if (key === 'home') this.home();
    return true;
  }

  /** A button pressed on the paper at `x`, `y` (CSS px from its top left): 0 pans, 2 turns. */
  pointerDown(x: number, y: number, button: number): void {
    this.pointer = { x, y, button };
  }

  /** The pointer at `x`, `y`: a held button pans or turns, from where it was. */
  pointerMove(x: number, y: number): void {
    const { button } = this.pointer;
    const [right, down] = [x - this.pointer.x, y - this.pointer.y];
    this.pointer = { x, y, button };
    if (!this.goal || !this.shown || button === null) return;
    const moved = button === 2 ? dragTurn(this.goal, right, down) : panned(this.goal, [right, down]);
    [this.goal, this.shown] = [moved, button === 2 ? { ...this.shown, yaw: moved.yaw, pitch: moved.pitch } : moved];
  }

  pointerUp(): void {
    this.pointer = { ...this.pointer, button: null };
  }

  /** The wheel turned by `factor` (over 1 nearer) with the pointer at `x`, `y`: zoomed about the pointer. */
  wheel(x: number, y: number, factor: number): void {
    if (!this.goal || !this.shown) return;
    const pointer: readonly [number, number] = [x - this.paper.width / 2, y - this.paper.height / 2];
    [this.goal, this.shown] = [zoomedAt(this.goal, factor, pointer), zoomedAt(this.shown, factor, pointer)];
  }

  /** One frame of the map, `seconds` on, on paper `paper` (CSS px), the company at `company`; null while shut. */
  frame(seconds: number, paper: Size, company: readonly MapBody[]): MapShown | null {
    this.paper = paper;
    const walked = this.walked;
    if (!this.open || !walked || !this.goal || !this.shown) return null;
    this.shown = eased(this.shown, this.goal, seconds);
    const view = this.shown;
    const { layout, storeys } = walked;
    const playerStorey = storeyOfHeight(storeys, this.player?.feet[2] ?? 0);
    const marks: PaperMark[] = [];
    const seen = (point: Point) => {
      const storey = storeyOfHeight(storeys, point[2]);
      const [column, row] = [Math.floor(point[0] / layout.cell), Math.floor(point[1] / layout.cell)];
      return walked.reveal.cells.has(cellIndex(layout, storey, column, row));
    };
    const place = (kind: PaperMark['kind'], point: Point, facing: number, name: string) => {
      const storey = storeyOfHeight(storeys, point[2]);
      const [across, down] = toPaper(view, point);
      const [aheadU, aheadV] = toPaper(view, [point[0] + Math.sin(facing), point[1] - Math.cos(facing), point[2]]);
      const [x, y] = [across + paper.width / 2, down + paper.height / 2];
      const turn = Math.atan2(aheadU - across, down - aheadV);
      marks.push({ kind, x, y, turn, name, faint: !this.every && storey !== this.storey });
    };
    const floorOf = (storey: number) => storeys.floors[storey] ?? 0;
    const wayIn: Point = [layout.arrival.x, layout.arrival.y, floorOf(0)];
    if (seen(wayIn)) place('wayIn', wayIn, 0, 'The way in');
    const endRoom = layout.rooms[layout.end] as { readonly storey?: number } | undefined;
    const portal: Point = [layout.portal.x, layout.portal.y, floorOf(endRoom?.storey ?? 0)];
    if (seen(portal)) place('portal', portal, 0, 'The return portal');
    for (const stair of storeys.stairs) {
      const middle = this.middleOf(stair.upper * storeys.plane + (stair.cells[1] ?? 0));
      const point: Point = [middle[0], middle[1], floorOf(stair.upper)];
      const down = this.storey <= stair.upper;
      const words = down ? `Stairs down to storey ${stair.upper + 2}` : `Stairs up to storey ${stair.upper + 1}`;
      if (seen(point)) place('stairs', point, 0, words);
    }
    for (const body of company) place('company', body.feet, body.facing, body.name);
    if (this.player) place('player', this.player.feet, this.player.facing, 'You');
    // Only the mark nearest the pointer is named, the one drawn over the others where two lie as near.
    const away = (mark: PaperMark) => Math.hypot(mark.x - this.pointer.x, mark.y - this.pointer.y);
    const nearest = marks.reduce<PaperMark | null>(
      (best, mark) => (!best || away(mark) <= away(best) ? mark : best),
      null,
    );
    const named = marks.map((mark) => ({
      ...mark,
      name: mark === nearest && away(mark) <= NAME_PX ? mark.name : null,
    }));
    return { view, storey: this.storey, playerStorey, count: storeys.count, every: this.every, marks: named };
  }
}

/** The one map the game holds. */
export const DUNGEON_MAP = new DungeonMap();
