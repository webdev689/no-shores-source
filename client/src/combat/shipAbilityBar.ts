// The ship's abilities at the bottom left in a sea fight, built as the Art's bar is (`ringSlot.ts`): each an icon in a
// brass ring over its key's keycap. A broadside's ring is swept dark as its side reloads, its last seconds counted,
// lit once loaded and glowing gold while the look lays that side; the burst's drains its light as it runs and sweeps
// as it recharges; the brace's is lit while it is held; the load's shows the shot the guns take. Each flashes as it is
// used (a side fires, the burst begins, the brace is taken, the load changes) and greys under a hatch while it cannot
// be. It is drawn from a list of abilities, so another is one more of them.
import { motionReduced } from '../plus/kit.ts';
import type { ShipAbility } from '../plus/seaFight.ts';
import { TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import { ARMS_SIZES, RING_CELLS } from './hudLayout.ts';
import {
  drainSteps,
  type Glow,
  ringNode,
  type RingLook,
  slotNode,
  slotTall,
  type Sweep,
  sweepOf,
  TurnedPictures,
  USED_SECONDS,
} from './ringSlot.ts';
import { SHIP_RING, shipIconSvg } from './shipIcons.ts';

/** A key that is no word drawn on its keycap (a mouse's button, a pad's), each texel `texel` pixels a side; null for
 *  one written in words. */
export type CapFace = (key: string, texel: number) => Node | null;

/** A ring's glow: once ready in its own brass; gold and stronger where the look lays its side; near white in use. */
const GLOWS = {
  ready: { width: 2, colour: TONES.brassHi, opacity: 0.45 },
  laid: { width: 3, colour: '#ffc940', opacity: 0.9 },
  active: { width: 2, colour: '#fff3c4', opacity: 0.6 },
} as const satisfies Record<string, Glow>;
/** Float error left by a share worked out from ticks, kept from reading as a fall. */
const EPSILON = 1e-6;

/** An ability as its ring shows it: its wedge and seconds while it recharges (none while ready or in use), the steps of
 *  its ring lit while in use, and the glow round it. */
export interface ShipSlotShown {
  readonly sweep: Sweep | null;
  readonly drain: number;
  readonly glow: Glow | null;
}

/** How `ability`'s ring shows it. */
export function shipSlotShown(ability: ShipAbility): ShipSlotShown {
  const { state } = ability;
  const glow = state === 'active' ? GLOWS.active : state !== 'ready' ? null : ability.laid ? GLOWS.laid : GLOWS.ready;
  return {
    sweep: state === 'charging' ? sweepOf(ability.charge, ability.left) : null,
    drain: state === 'active' ? drainSteps(ability.running) : 0,
    glow: ability.unable ? null : glow,
  };
}

/** Which of `now`'s abilities were used since `was`: its recharge begun again (a side fired, the burst spent), its
 *  use begun (the brace taken) or its picture changed (another load). One not there before was not. A new load puts
 *  each loaded side back on its clock, which is no side fired. */
export function usedBetween(was: readonly ShipAbility[] | null, now: readonly ShipAbility[]): boolean[] {
  const changed = (ability: ShipAbility) => was?.find((each) => each.id === ability.id)?.icon !== ability.icon;
  const reloaded = now.some((ability) => ability.id === 'load' && was !== null && changed(ability));
  return now.map((ability) => {
    const before = was?.find((each) => each.id === ability.id);
    if (!before) return false;
    const begun = ability.state === 'active' && before.state !== 'active';
    return (!reloaded && ability.charge < before.charge - EPSILON) || begun || ability.icon !== before.icon;
  });
}

/** A key as its keycap writes it: a pad's button by its own name. */
export const capWords = (key: string): string => key.replace(/^pad:/, '');

/** How far the bar reaches from its corner with `count` abilities at its step (`wide`) and `zoom`: across, and up from
 *  the foot of its slots, in the view's pixels. */
export function shipBarSize(
  count: number,
  wide: boolean,
  zoom = 1,
): { readonly width: number; readonly height: number } {
  const { cell, gap } = wide ? ARMS_SIZES.wide : ARMS_SIZES.base;
  const width = count > 0 ? (count * RING_CELLS * cell + (count - 1) * gap) * zoom : 0;
  return { width, height: count > 0 ? slotTall(cell, zoom) : 0 };
}

/** The bar on the display, kept each frame from the ship's abilities and drawn from what it last kept. */
export class ShipAbilityBar {
  private abilities: readonly ShipAbility[] | null = null;
  /** How long each ability, by its id, has to flash yet, having just been used. */
  private readonly used = new Map<string, number>();
  private readonly pictures = new TurnedPictures();
  private readonly face: CapFace | null;

  /** With `face`, a key that is no word stands drawn on its keycap. */
  constructor(face: CapFace | null = null) {
    this.face = face;
  }

  /** How many abilities it shows. */
  get count(): number {
    return this.abilities?.length ?? 0;
  }

  /** Shows `abilities` `seconds` on; none hides the bar. */
  update(abilities: readonly ShipAbility[] | null, seconds = 0): void {
    if (!abilities) {
      this.abilities = null;
      this.used.clear();
      return;
    }
    const used = usedBetween(this.abilities, abilities);
    abilities.forEach((ability, index) =>
      this.used.set(ability.id, used[index] ? USED_SECONDS : Math.max(0, (this.used.get(ability.id) ?? 0) - seconds)),
    );
    this.abilities = abilities;
  }

  /** What a screen reader says of each ability: its name, its key, and how it stands. */
  words(): readonly string[] {
    return (this.abilities ?? []).map((ability) => `${ability.name} (${capWords(ability.key)}), ${ability.said}`);
  }

  /** The bar at its step (`wide`) and `zoom`, each ability's ring over its key, in its order; none while hidden. */
  node(wide: boolean, zoom = 1): Node | null {
    const abilities = this.abilities;
    if (!abilities || abilities.length === 0) return null;
    const { cell, gap } = wide ? ARMS_SIZES.wide : ARMS_SIZES.base;
    const still = motionReduced();
    const words = this.words();
    const texel = (cell === 2 ? 1 : 2) * zoom;
    const ring = (ability: ShipAbility): Node => {
      const shown = shipSlotShown(ability);
      const lit = ability.state !== 'charging';
      const look: RingLook = {
        ring: { key: 'ship ring', svg: SHIP_RING },
        icon: { key: `ship ${ability.icon}`, svg: shipIconSvg(ability.icon) },
        frame: ability.state === 'active' ? [1, 1.5] : lit ? [1, 1.25] : [0.45, 0.8],
        iconTurn: ability.state === 'active' ? [1, 1.2] : lit ? [1, 1] : [0.5, 0.7],
        glow: shown.glow,
        sweep: shown.sweep,
        drain: shown.drain,
        unable: ability.unable,
        used: this.used.get(ability.id) ?? 0,
      };
      return ringNode(look, this.pictures, cell, zoom, still);
    };
    return {
      label: 'Your Ship',
      direction: 'row',
      alignY: 'end',
      gap: gap * zoom,
      children: abilities.map((ability, index) =>
        slotNode(
          ring(ability),
          capWords(ability.key),
          words[index] ?? '',
          cell,
          zoom,
          this.face?.(ability.key, texel) ?? null,
        ),
      ),
    };
  }
}
