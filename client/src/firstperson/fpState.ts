import type { GlowElement } from '../elementGlow.ts';
import type { Climb } from './climbHands.ts';
import type { Pace } from './weaponMachine.ts';

/** What the first person shows this frame, from the one who sees it. `right` and `left` are forge layers (`sword_iron`,
 *  `bow_long_elven`, `pistolet_l`, `shield_kite_iron`, `torch_l`, `lantern`; null for an empty hand), `armour` the sets
 *  worn on the hands and feet (`iron`, `fighters`), `stride` the metres walked, `climbing` how far the hands have
 *  closed on a wall (0 to 1), `element` a cast's light, `mounted` riding, `yaw` the look's bearing in radians (rising
 *  to the right), and `blocking` a shield raised for a block. */
export interface FirstPersonState {
  readonly right: string | null;
  readonly left: string | null;
  readonly armour: { readonly gauntlets?: string; readonly boots?: string };
  readonly drawn: boolean;
  readonly moving: boolean;
  readonly running: boolean;
  readonly stride: number;
  readonly casting: boolean;
  readonly climbing: number;
  /** The climb the hands are on, which they follow; none off the wall. */
  readonly climb?: Climb | null;
  /** How far the view looks down, radians, negative up: the fists on a wall stay on it as the view tilts. */
  readonly pitch?: number;
  /** The view's vertical field, radians: the lens the fists on a wall are pinned to it through. */
  readonly fov?: number;
  readonly element?: string;
  /** The element a cast's light is recoloured to: its Art's. */
  readonly castGlow?: GlowElement | null;
  readonly mounted?: boolean;
  /** The coat and barding the ridden horse wears, by their cosmetics' ids; none for the bay and the bare horse. */
  readonly horse?: { readonly coat: string | null; readonly barding: string | null };
  /** The cosmetic dye worn, by its id, which the gauntlets and boots take; none for their own colours. */
  readonly dye?: string | null;
  /** The faction, by its key, whose own colour the gauntlets, the boots and each hand's weapon wear; none for none. */
  readonly own?: { readonly hands?: string; readonly feet?: string; readonly right?: string; readonly left?: string };
  readonly yaw?: number;
  readonly blocking?: boolean;
  /** A weapon held in a fight's pose, one of its strokes' frames: a guard, a parry's deflect. */
  readonly pose?: { readonly record: number; readonly frame: number } | null;
  /** How far the view is zoomed in (aiming): the hands zoom with it, about the middle of the screen. */
  readonly zoom?: number;
  /** The fight's own timing of the swing it has begun, which a strike begun now keeps; none outside a fight. */
  readonly pace?: Pace | null;
  /** The forge body the player wears, whose sets' light a covering colour is laid by, as the figure's is. */
  readonly body?: string;
  /** What the hands would hold drawing the other loadout, whose pictures are asked for ahead of a swap. */
  readonly spare?: { readonly right: string | null; readonly left: string | null; readonly own?: Armed } | null;
  /** How far through a healing drink the player is, 0 to 1, the weapon put away for it; none while not drinking. */
  readonly drinking?: number | null;
}

/** The faction, by its key, whose own colour each hand's weapon of a loadout wears; none for none. */
export type Armed = { readonly right?: string | undefined; readonly left?: string | undefined };
