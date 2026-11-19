// The story's last moment, played on foot in Overlook's social space once the game has the player there: the stranger
// who brought them stands beside them and says their last words, then walks off into the town and is gone. The
// journey from here is the player's own.
import type { CardAt, Cards } from '../../player/cards.ts';
import { onScreen, type Shot } from '../camera.ts';
import { actorCards, type Actor } from './actors.ts';
import { STRANGER_DRESS, STRANGER_ID } from './shore.ts';
import type { Stage } from './stage.ts';

/** Where the stranger stands from the player (metres to their right), when they walk off, how fast, and how far. */
const BESIDE_M = 1.4;
const WALK_M_S = 1.3;
const GONE_M = 18;

export class Epilogue {
  private readonly stage: Stage;
  private readonly forge: Cards;
  /** Where the stranger stands, fixed once the player is first seen. */
  private standing: { x: number; y: number; facing: number; z: number } | null = null;
  private spoken = false;
  private walked = 0;
  done = false;

  constructor(stage: Stage, forge: Cards) {
    this.stage = stage;
    this.forge = forge;
  }

  /** A frame on foot: the stranger's card for the eye, their words over their head; null once they have gone. */
  frame(
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
    seconds: number,
    clock: number,
    you: { readonly x: number; readonly y: number; readonly z: number; readonly facing: number },
    groundAt: (x: number, y: number) => number | null,
  ): CardAt[] {
    if (this.done) return [];
    if (!this.standing) {
      const right = you.facing + Math.PI / 2;
      const [x, y] = [you.x + Math.sin(right) * BESIDE_M, you.y - Math.cos(right) * BESIDE_M];
      this.standing = { x, y, facing: Math.atan2(you.x - x, y - you.y), z: groundAt(x, y) ?? you.z };
      void this.stage.play('arrived', true, { stranger: 'stranger' }).then(() => (this.spoken = true));
    }
    const standing = this.standing;
    if (this.spoken) {
      this.walked += seconds;
      // Away from the player, toward the town behind them.
      const away = standing.facing + Math.PI;
      const step = WALK_M_S * seconds;
      standing.x += Math.sin(away) * step;
      standing.y -= Math.cos(away) * step;
      standing.z = groundAt(standing.x, standing.y) ?? standing.z;
      if (this.walked * WALK_M_S > GONE_M) this.done = true;
    }
    const facing = this.spoken ? standing.facing + Math.PI : standing.facing;
    const stranger: Actor = { id: STRANGER_ID, dress: STRANGER_DRESS, anim: this.spoken ? 'walk' : 'idle', ...standing, facing };
    const head = onScreen(shot, viewport, [standing.x, standing.y, standing.z + 2]);
    this.stage.parts.overheads.frame(seconds, new Map([['stranger', head]]));
    this.stage.parts.dialogue.frame(seconds);
    return actorCards([stranger], this.forge, shot.eye, clock);
  }
}
