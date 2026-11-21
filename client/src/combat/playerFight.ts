import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { InputFrame } from '../player/input.ts';
import { SHOOTERS, type Walker } from '../player/walker.ts';
import type { CombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import { CastKeys } from './casting.ts';
import { type Reticle, reticleOf } from './reticle.ts';
import type { Fighting } from './fighting.ts';

type Point = readonly [number, number, number];

/** What the display needs of the player's frame in a fight: whether a ranged weapon is out to fight with, whether the
 *  Ranged loadout is drawn on a body free to shoot (from the outfit shown, the pointer held or not), the reticle of the
 *  weapon drawn on a free body (none while none is), whether it aims, whether a swing or a dodge was pressed (the
 *  stamina flashes for one pressed with none), and whether its trigger was pulled (an empty gun clicks). */
export interface PlayerFightFrame {
  readonly shooter: boolean;
  readonly ranged: boolean;
  readonly rangedDrawn: boolean;
  readonly reticle: Reticle | null;
  readonly aiming: boolean;
  readonly pressed: boolean;
  readonly pulled: boolean;
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
  private readonly castKeys = new CastKeys();
  /** The rooms the fight had joined when the keys last cast: a room joined afresh starts them afresh. */
  private castJoins: number;
  private armsKey = '';

  constructor(fight: Fighting, rules: CombatRules, walker: Walker) {
    this.fight = fight;
    this.rules = rules;
    this.walker = walker;
    this.castJoins = fight.joins;
  }

  /**
   * One frame: `steps` the fight's movement rules, the room's clock run while `running`, the fight's buttons taken
   * only while `hands` (the pointer held), an aimed shot laid on `markOf`'s point (the crosshair's), and the first
   * person's hands zoomed with the view by `zoomOf` once the player has stepped, moving `handsSeconds` on. The buttons:
   * a swing or a shot only with the weapon already out, on foot, the hands free; a guard on foot; a dodge and a drink
   * whenever pressed (the rules refuse them in the air or the saddle). A bow, a crossbow or a gun drawn: the swing's
   * button aims it and the guard's fires it, and no guard rises behind it.
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
      handsSeconds = seconds,
    }: {
      running: boolean;
      hands: boolean;
      markOf: () => Point | null;
      zoomOf: () => number;
      handsSeconds?: number;
    },
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
    const floorAt = (x: number, y: number) => steps.standing(x, y).z;
    this.castFrame(controls, seconds, hands && free && !player.mounted, { markOf, floorAt });
    // A cast under way holds off a drink, as the room does: sent, aimed, or its move still playing.
    const casting = this.castKeys.waiting || walker.player.cast !== null;
    fight.press({
      swing: armed && !shooter && controls.held('swing'),
      shoot: ranged && controls.held('guard'),
      guard: guards && controls.held('guard'),
      dodge: hands && controls.pressed('dodge'),
      heal: hands && controls.pressed('heal') && !casting,
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
    const shown = {
      own: fight.own,
      begun: fight.swingsBegun > 0,
      dropped: fight.drawsDropped > 0,
      loosed: fight.shotsLoosed > 0,
      aiming,
      handsSeconds,
    };
    [fight.swingsBegun, fight.drawsDropped, fight.shotsLoosed] = [0, 0, 0];
    walker.show(controls, seconds, clock, shown, zoomOf());
    const { outfit } = walker.wornDress;
    // A greatsword's left hand is on its hilt, which combat's arms read as the left hand's own.
    const left = outfit.grip === 'hilt' ? 'hilt' : outfit.left;
    const handsKey = `${outfit.right}|${left}|${outfit.drawn}`;
    if (handsKey !== this.armsKey) {
      this.armsKey = handsKey;
      fight.arms = this.rules.armsCode(outfit.right, left, outfit.drawn);
    }
    fight.look = walker.look;
    fight.dress = walker.lookDress;
    const pressed = (armed && !shooter && controls.pressed('swing')) || (hands && controls.pressed('dodge'));
    // The sights (the crosshair and its shots) follow the weapon in hand, which the rules may not have taken up yet.
    const held = walker.shownDress.outfit;
    const drawnReticle = held.drawn && free && !player.mounted ? reticleOf(held.right ?? null) : null;
    // The melee reticle stands only while the hands are the player's: not over a menu, a cutscene or a freed pointer.
    const reticle = drawnReticle === 'melee' && !hands ? null : drawnReticle;
    const rangedDrawn = reticle !== null && reticle !== 'melee';
    return { shooter, ranged, rangedDrawn, reticle, aiming, pressed, pulled: ranged && controls.pressed('guard') };
  }

  /** The casting keys: a cast sent to the room plays its move in its Art's colour, and Dusk Daggers' ring is laid while
   *  it is aimed, on the ground `floorAt` gives. */
  private castFrame(
    controls: InputFrame,
    seconds: number,
    hands: boolean,
    { markOf, floorAt }: { markOf: () => Point | null; floorAt: (x: number, y: number) => number },
  ): void {
    const { fight, walker } = this;
    if (fight.joins !== this.castJoins) {
      this.castJoins = fight.joins;
      this.castKeys.reset();
    }
    const state = fight.arts;
    const { cast, ring } = this.castKeys.frame(controls, seconds, {
      hands,
      state,
      abilities: fight.abilities,
      own: fight.own,
      yaw: walker.player.yaw,
      markOf,
      floorAt,
    });
    fight.aimRing = ring;
    if (!cast) return;
    fight.cast(cast);
    const element = arts.arts.find((art) => art.id === state?.art)?.element ?? 0;
    if (cast.spell > 0 && (element === 1 || element === 2 || element === 3)) walker.beginCast(element);
  }
}
