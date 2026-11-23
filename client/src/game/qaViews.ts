// Offline QA: stands the player at a point of the loaded node, to picture many places in one page load. Only an
// offline page with `&spawn=` in its address installs it; online play never does.
import { insideRing, type Spot } from '../editor/placeDrawing.ts';
import type { Player } from '../player/player.ts';
import { FIRST_PERSON, type ViewMode } from '../player/playerCamera.ts';
import type { NodeInfo } from './worldData.ts';

/** East and south in metres, the bearing in degrees, and the camera: `first`, or `third,<m>[,<degrees looking
 *  down>]`. */
export type QaView = readonly [number, number, number, string];

/** The way a view looks: its bearing as the player's yaw, and its camera; null for a camera not understood, or where
 *  the point is outside the node's section, since the ground there is not loaded. */
export function qaLook(
  ring: readonly Spot[],
  [east, south, bearing, camera]: QaView,
): { yaw: number; pitch: number; view: ViewMode } | null {
  if (!insideRing(ring, [east, south])) return null;
  // Not `askedView`: the wheel's 10 m limit would pull a high view down.
  const [kind, metres, down] = camera.split(',');
  const distance = Number(metres);
  const pitch = down === undefined ? 0.1 : (Number(down) * Math.PI) / 180;
  if (kind !== 'first' && !(kind === 'third' && distance > 0 && Number.isFinite(pitch))) return null;
  const view = kind === 'first' ? FIRST_PERSON : { firstPerson: false, distance, shown: distance };
  return { yaw: (bearing * Math.PI) / 180, pitch, view };
}

/** What the page lends the hook: the node the player is on foot in, a way to arrive in a node (the room places the
 *  body, so only an arrival moves it), and the player. */
export interface QaHost {
  readonly node: () => NodeInfo | null;
  readonly arrive: (node: NodeInfo, facing: number) => Promise<void>;
  readonly walker: { player: Player };
  /** Whether the player lies dead. */
  readonly dead?: () => boolean;
  /** Puts the player aboard at sea, as the menu's "Return to ship" does. */
  readonly sea?: () => void;
  /** The game's state, for a development page's picture steps. */
  readonly game?: object;
}

/** Puts `__qaView(view)` and `__qaWhere()` on `target` for the picture driver, when the page plays alone (`offline`)
 *  and asks for a spawn, and on a development page (`dev`) `__qaLook(view)`, `__qaSea()` and `__qaGame` too. A view
 *  arrives again in the same node with its point as the spawn, as `&spawn=` does, then sets the camera; it answers
 *  whether it did. */
export function installQaViews(
  target: object,
  search: string,
  offline: boolean,
  host: QaHost,
  dev: boolean = import.meta.env?.DEV ?? false,
): void {
  if (!offline || !new URLSearchParams(search).has('spawn')) return;
  const hook = target as { __qaView?: (view: QaView) => Promise<boolean>; __qaWhere?: () => object };
  hook.__qaView = async (view) => {
    const node = host.node();
    const look = node && qaLook(node.ring, view);
    if (!node || !look) return false;
    await host.arrive({ ...node, spawns: [[view[0], view[1]]] }, look.yaw);
    host.walker.player = { ...host.walker.player, view: look.view, pitch: look.pitch };
    return true;
  };
  hook.__qaWhere = () => {
    const { body } = host.walker.player;
    return { x: body.x, y: body.y, dead: host.dead?.() ?? false };
  };
  if (!dev) return;
  // A development build's alone: turning the camera to a view without arriving again, so the room (and an event it
  // runs) plays on, the body staying; the way to sea; and the game's state, which a picture's steps read and drive.
  const lookAt = (view: QaView) => {
    const node = host.node();
    const look = node && qaLook(node.ring, view);
    if (!look) return false;
    host.walker.player = { ...host.walker.player, yaw: look.yaw, view: look.view, pitch: look.pitch };
    return true;
  };
  Object.assign(target, { __qaLook: lookAt, __qaSea: host.sea, __qaGame: host.game });
}
