// The page's side of the player's fall in a social space, frame by frame: how their figure shows it, the camera held
// where it was the moment the room said they fell, turning after the body, when death may be told, and the falls
// heard, their own and others'.

import type { Point3 } from '../cinema/rail.ts';
import type { SeenPlayer, Standing } from '../network/messages.ts';
import type { Placed } from '../player/figures.ts';
import type { Body } from '../rules/movementRules.ts';
import type { Shot } from './camera.ts';
import { fallPlayed, fallShown, heldShot, tumbleFacing } from './fallLaw.ts';
import { FallSounds } from './fallSounds.ts';
import { worldOutput } from './uiSounds.ts';

/** The rules' ticks a second, which the room's word on a death counts in. */
const TICKS_A_SECOND = 60;

/** The fall as the figure shows it: tumbling down, or lying where it landed, facing `facing`. */
export interface FigureFall {
  readonly tumbling: boolean;
  readonly facing: number;
}

/** A fall watched from the moment the room says the player fell until they stand again. */
export class FallWatch {
  private held: Shot | null = null;
  private last: Shot | null = null;
  /** The facing the body died with, the seconds after death it landed, and the facing it lies with. */
  private diedFacing: number | null = null;
  private landedAt: number | null = null;
  private lyingFacing = 0;
  private secondsDead = 0;
  private readonly sounds = new FallSounds(worldOutput);

  /** How the player's figure shows the fall, with the room's word on their standing and the body as the page has it
   *  (facing `facing`); null for no fall, which ends any watched. */
  figure(standing: Standing, body: Body, facing: number): FigureFall | null {
    const shown = fallShown(standing, body.mode);
    if (shown === null || standing.kind !== 'dead') {
      [this.held, this.last, this.diedFacing, this.landedAt, this.secondsDead] = [null, null, null, null, 0];
      return null;
    }
    this.secondsDead = standing.ticks / TICKS_A_SECOND;
    this.diedFacing ??= facing;
    if (shown === 'lying' && this.landedAt === null) this.landedAt = this.secondsDead;
    if (this.landedAt === null) {
      this.lyingFacing = tumbleFacing(this.diedFacing, this.secondsDead);
      return { tumbling: true, facing: this.lyingFacing };
    }
    return { tumbling: false, facing: this.lyingFacing };
  }

  /** The frame's shot: `shot` as the camera follows, but held from the first frame of a fall, turning `seconds` on
   *  after the body whose feet are at `feet`. */
  shot(shot: Shot, feet: Point3, seconds: number): Shot {
    if (this.diedFacing === null) return shot;
    this.held ??= shot;
    this.last = heldShot(this.held, this.last ?? this.held, feet, seconds);
    return this.last;
  }

  /** Whether death may be told, `fell` by a fall or not: at once for straying, once the fall has played. */
  told(fell: boolean): boolean {
    return fallPlayed(fell, this.secondsDead, this.landedAt);
  }

  /** The falls heard this frame: the player's own body at `feet` while it tumbles or lies, and every other player
   *  the room says fell, where their figure is drawn, while their body is in the air or lies where it landed. */
  hear(
    own: { readonly id: number; readonly feet: Point3; readonly tumbling: boolean; readonly lying: boolean },
    others: ReadonlyMap<number, SeenPlayer>,
    placed: ReadonlyMap<number, Placed>,
    frame: { readonly seconds: number; readonly eye: Point3; readonly quiet: boolean },
  ): void {
    const bodies = [{ id: own.id, at: own.feet, falling: own.tumbling, lying: own.lying }];
    for (const [id, seen] of others) {
      const figure = placed.get(id);
      const place: Point3 = figure ? [figure.x, figure.y, figure.z] : [seen.body.x, seen.body.y, seen.body.z];
      const shown = fallShown(seen.standing, seen.body.mode);
      bodies.push({ id, at: place, falling: shown === 'tumbling', lying: shown === 'lying' });
    }
    this.sounds.frame(bodies, frame.seconds, frame.eye, frame.quiet);
  }

  /** Stops every fall's sound, as the player leaves. */
  close(): void {
    this.sounds.clear();
  }
}
