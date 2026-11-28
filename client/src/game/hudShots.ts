// Pictures of the key strip and the leave held, headless (`tools/uiShot.mjs`), over a plain dusk in place of the
// world: on foot at rest with the leave half held, a melee weapon drawn, sailing over the ship's console, the pad's buttons,
// and under a quest's tracker. The game never imports it.
import { BINDS } from '../player/input.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { type OnFoot, footStrip, stripOf, withMapAndChat } from './hints.ts';
import { Hud } from './hud.ts';

const DUSK = '#4a5662';
const REST: OnFoot = {
  worn: 1,
  drawn: false,
  ranged: false,
  aiming: false,
  daggers: false,
  mounted: false,
  mode: 'ground',
  free: false,
};

/** Each shot's HUD, kept across its frames, as the strip stands by where it was laid the frame before. */
const huds = new Map<string, Hud>();

/** The HUD of shot `name` over dusk in Overlook, its veil lifted, with `set` done to it each frame. */
function hudOver(ui: Interface, name: string, set: (hud: Hud) => void): Node {
  let hud = huds.get(name);
  if (!hud) {
    hud = new Hud();
    hud.veil(null);
    hud.place('Overlook', 'Social space · Saltmere');
    huds.set(name, hud);
  }
  set(hud);
  return { width: 'grow', height: 'grow', fill: DUSK, children: [hud.node(ui)] };
}

/** At rest on foot, an Art worn, the map's key and the leave's; the leave held 60% of its way. */
export function stripRestShot(ui: Interface): Node {
  return hudOver(ui, 'rest', (hud) => {
    hud.strip(withMapAndChat(footStrip(REST)));
    // Held 60% of its way, and kept there.
    if (hud.leaving.held === 0) hud.leaving.frame(true, true, null, 0.9);
  });
}

/** A melee weapon drawn, the mouse free. */
export function stripMeleeShot(ui: Interface): Node {
  return hudOver(ui, 'melee', (hud) => hud.strip(withMapAndChat(footStrip({ ...REST, drawn: true, free: true }))));
}

/** Sailing in the Oversea view. */
export function stripSeaShot(ui: Interface): Node {
  return hudOver(ui, 'sea', (hud) => hud.strip(stripOf('oversea')));
}

/** At rest on foot as the pad shows it. */
export function stripPadShot(ui: Interface): Node {
  const device = BINDS.device;
  BINDS.device = 'pad';
  try {
    return hudOver(ui, 'pad', (hud) => hud.strip(withMapAndChat(footStrip(REST))));
  } finally {
    BINDS.device = device;
  }
}

/** At rest on foot under a quest's tracker, as a narrow view stands the tracker across from the strip. */
export function stripTrackedShot(ui: Interface): Node {
  return hudOver(ui, 'tracked', (hud) => {
    hud.strip(withMapAndChat(footStrip(REST)));
    hud.tasks.show({
      name: 'The Opening',
      task: 'Meet the houses',
      steps: [{ text: 'Hear the three houses' }, { text: 'Visit the Quartermaster' }, { text: 'Find the Tack' }],
    });
  });
}
