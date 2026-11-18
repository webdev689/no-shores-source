import type { InputFrame } from '../player/input.ts';
import { SHOOTERS, type Walker } from '../player/walker.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import type { Fighting } from './fighting.ts';

type Point = readonly [number, number, number];

/** What the display needs of the player's frame in a fight: whether a ranged weapon is drawn and aims, and whether a
 *  swing or a dodge was pressed (the stamina flashes for one pressed with none). */
export interface PlayerFightFrame {
  readonly shooter: boolean;
  readonly ranged: boolean;
  readonly aiming: boolean;
  readonly pressed: boolean;
}

/**
 * The player in a fight, frame by frame, on any page: the fight's buttons pressed from the controls, the body stepped
 * by the fight's own steps (each tick's intent sent to the room and the fighter predicted), the room's clock let run,
 * and the walker shown as the fight holds the player, its arms, look and dress told to the room.
 */
export class PlayerFight {
  readonly fight: Fighting;
  private readonly rules: CombatRules;
  private readonly walker: Walker;
  private armsKey = '';

  constructor(fight: Fighting, rules: CombatRules, walker: Walker) {
    this.fight = fight;
    this.rules = rules;
    this.walker = walker;
  }

  /**
   * One frame: `steps` the fight's movement rules, the room's clock run while `running`, the fight's buttons taken
   * only while `hands` (the pointer held), an aimed shot laid on `markOf`'s point (the crosshair's), and the first
   * person's hands zoomed with the view by `zoomOf` once the player has stepped. The buttons:
   * a swing or a shot only with the weapon already out, on foot, the hands free; a guard on foot; a dodge whenever
   * pressed (the rules refuse one in the air or the saddle). A bow, a crossbow or a gun drawn: the swing's button aims
   * it and the guard's fires it, and no guard rises behind it.
   */
  frame(
    controls: InputFrame,
    steps: MovementRules,
    seconds: number,
    clock: number,
    {
      running,
      hands,
      markOf,
      zoomOf,
    }: { running: boolean; hands: boolean; markOf: () => Point | null; zoomOf: () => number },
  ): PlayerFightFrame {
    const { walker, fight } = this;
    const { player, you } = walker;
    const free = player.body.mode === 'ground' || player.body.mode === 'air';
    const armed = hands && you.dress.outfit.drawn && free && !player.mounted;
    const shooter = SHOOTERS.test(you.dress.outfit.right ?? '');
    const ranged = armed && shooter;
    const aiming = ranged && controls.held('swing');
    const guards = hands && free && !player.mounted && !ranged;
    // Each press is the fight's even when let go within the frame; one of the guard's two keys pressed while the other
    // is held is a fresh press.
    fight.press({
      swing: armed && !shooter && controls.held('swing'),
      shoot: ranged && controls.held('guard'),
      guard: guards && controls.held('guard'),
      dodge: hands && controls.pressed('dodge'),
      pitch: -player.pitch,
      aim: aiming,
      mark: aiming ? markOf() : null,
      swingPressed: armed && !shooter && controls.pressed('swing'),
      shootPressed: ranged && controls.pressed('guard'),
      guardPressed: guards && controls.pressed('guard'),
    });
    const foe = fight.targetAt;
    const toward = foe && Math.atan2(foe.x - player.body.x, -(foe.y - player.body.y));
    walker.step(controls, steps, seconds, toward, aiming);
    if (running) fight.pump(seconds);
    const shown = { own: fight.own, begun: fight.swingsBegun > 0, dropped: fight.drawsDropped > 0, aiming };
    [fight.swingsBegun, fight.drawsDropped] = [0, 0];
    walker.show(controls, seconds, clock, shown, zoomOf());
    const { outfit } = walker.shownDress;
    const handsKey = `${outfit.right}|${outfit.left}|${outfit.drawn}`;
    if (handsKey !== this.armsKey) {
      this.armsKey = handsKey;
      fight.arms = this.rules.armsCode(outfit.right, outfit.left, outfit.drawn);
    }
    fight.look = walker.look;
    fight.dress = walker.lookDress;
    const pressed = (armed && !shooter && controls.pressed('swing')) || (hands && controls.pressed('dodge'));
    return { shooter, ranged, aiming, pressed };
  }
}
