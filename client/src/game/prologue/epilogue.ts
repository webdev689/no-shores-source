// The story's last moment, played on foot in Overlook's social space once the veil over the player's arrival has
// lifted: the stranger who brought them stands before them and says her last words, then walks off into the town and
// is let go once the player no longer sees her. Leaving the place ends it. The journey from here is the player's own.
import type { CardAt, Cards } from '../../player/cards.ts';
import { onScreen, type Shot } from '../camera.ts';
import { actorCards, type Actor } from './actors.ts';
import { OVER_HEAD_M, STRANGER_DRESS, STRANGER_HEAD, STRANGER_ID } from './shore.ts';
import { headOnView, type Stage, HUD_VEIL_S } from './stage.ts';

/** Where the stranger stands from the player, metres ahead and to their right, in front of the camera behind them. */
const AHEAD_M = 2.2;
const RIGHT_M = 1;
/** Her pace into the town, and how near its middle she stops. */
const WALK_M_S = 1.3;
const THERE_M = 2;
/** The point over her head her words stand on. */
const HEAD_M = STRANGER_HEAD.standing.crown + OVER_HEAD_M;
/** Her figure as the view sees it, this broad either side of her middle and sampled this often up from her feet. */
const HALF_BROAD_M = 0.35;
const SAMPLE_M = 0.2;
/** How long she walks off before she is let go even in sight: held at the water or at the town's middle, she would
 *  otherwise stand there for good. */
const LET_GO_S = 60;

type Standing = { x: number; y: number; z: number; facing: number };

export class Epilogue {
  private readonly stage: Stage;
  private readonly forge: Cards;
  private standing: Standing | null = null;
  /** Seconds since the veil over the arrival began to fall. */
  private lifted = 0;
  private phase: 'waiting' | 'speaking' | 'going' = 'waiting';
  /** Seconds since she set off into the town. */
  private going = 0;
  done = false;

  constructor(stage: Stage, forge: Cards) {
    this.stage = stage;
    this.forge = forge;
  }

  /** A frame on foot: the stranger's card for the eye, her words over her head; nothing once she has gone.
   *  `veiled` while the arrival's veil is still up: she waits behind it. */
  frame(
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
    seconds: number,
    clock: number,
    you: { readonly x: number; readonly y: number; readonly z: number; readonly facing: number },
    veiled: boolean,
  ): CardAt[] {
    if (this.done || veiled) return [];
    this.lifted += seconds;
    const standing = (this.standing ??= this.placed(you));
    const head = headOnView(onScreen(shot, viewport, [standing.x, standing.y, standing.z + HEAD_M]), viewport);
    // Her words begin once the veil and the story's black are wholly gone and she is in the player's sight, so every
    // line is heard. Words that cannot be played still let her go.
    if (this.phase === 'waiting' && this.lifted >= HUD_VEIL_S && this.stage.screenOpen && head) {
      this.phase = 'speaking';
      const walkOff = () => {
        if (this.phase === 'speaking') this.phase = 'going';
      };
      this.stage.play('arrived', true, { stranger: 'stranger' }).then(walkOff, (error: unknown) => {
        console.error("the stranger's last words could not be played:", error);
        walkOff();
      });
    }
    if (this.phase === 'going') {
      this.going += seconds;
      if (this.going >= LET_GO_S || !inSight(shot, viewport, standing)) {
        this.leave();
        return [];
      }
    }
    const walking = this.phase === 'going' && this.walk(standing, seconds);
    this.stage.tick(seconds);
    this.stage.parts.overheads.frame(seconds, new Map([['stranger', head]]));
    this.stage.parts.dialogue.frame(seconds);
    const stranger: Actor = {
      id: STRANGER_ID,
      dress: STRANGER_DRESS,
      anim: walking ? 'walk' : 'idle',
      ...standing,
    };
    return actorCards([stranger], this.forge, shot.eye, clock);
  }

  /** The place she met the player in is left, or she is out of sight: she is gone, and nothing she said stays on the
   *  screen. Before the player has arrived anywhere there is no place to leave. */
  leave(): void {
    if (this.done || !this.standing) return;
    this.done = true;
    this.stage.hush();
  }

  /** Ahead of the player and to their right, facing them, on the ground there; to their left where the right is
   *  water, and at their own feet' height where both are. */
  private placed(you: { readonly x: number; readonly y: number; readonly z: number; readonly facing: number }) {
    const right = you.facing + Math.PI / 2;
    const spots = [RIGHT_M, -RIGHT_M].map((side) => {
      const x = you.x + Math.sin(you.facing) * AHEAD_M + Math.sin(right) * side;
      const y = you.y - Math.cos(you.facing) * AHEAD_M - Math.cos(right) * side;
      return { x, y, ground: this.stage.parts.scene.groundAt(x, y) };
    });
    const dry = spots.find((spot) => spot.ground !== null && spot.ground >= 0);
    const { x, y } = dry ?? (spots[0] as (typeof spots)[number]);
    return { x, y, z: dry?.ground ?? you.z, facing: Math.atan2(you.x - x, y - you.y) };
  }

  /** A step toward the town's middle, on dry ground only: where the next step is water or unknown she stands. True
   *  when she stepped. */
  private walk(standing: Standing, seconds: number): boolean {
    const landmass = this.stage.parts.landmass();
    const [toX, toY] = landmass.plan?.centre ?? landmass.nodes[0]?.centre ?? [standing.x, standing.y];
    const far = Math.hypot(toX - standing.x, toY - standing.y);
    if (far <= THERE_M) return false;
    standing.facing = Math.atan2(toX - standing.x, standing.y - toY);
    const step = Math.min(far, WALK_M_S * seconds) / far;
    const [x, y] = [standing.x + (toX - standing.x) * step, standing.y + (toY - standing.y) * step];
    const ground = this.stage.parts.scene.groundAt(x, y);
    if (ground === null || ground < 0) return false;
    Object.assign(standing, { x, y, z: ground });
    return true;
  }
}

/** Whether any of her figure, feet to the point over her head, is on the view: her head may have left its top while
 *  the player stands close or looks down at her. */
function inSight(
  shot: Shot,
  viewport: { readonly width: number; readonly height: number },
  standing: Standing,
): boolean {
  const [awayX, awayY] = [standing.x - shot.eye[0], standing.y - shot.eye[1]];
  const away = Math.hypot(awayX, awayY);
  // An eye inside her figure sees none of the points across her middle, yet she fills the view.
  if (away <= HALF_BROAD_M + shot.near) return true;
  const [sideX, sideY] = [-awayY / away, awayX / away];
  for (let up = 0; up <= HEAD_M; up += SAMPLE_M)
    for (const side of [-HALF_BROAD_M, 0, HALF_BROAD_M]) {
      const point = [standing.x + sideX * side, standing.y + sideY * side, standing.z + up] as const;
      if (headOnView(onScreen(shot, viewport, point), viewport)) return true;
    }
  return false;
}
