// Offline QA: stands the player at a point of the loaded node, to picture many places in one page load. Only an
// offline page with `&spawn=` in its address installs it; online play never does.
import { insideRing, type Spot } from '../editor/placeDrawing.ts';
import type { Player } from '../player/player.ts';
import { FIRST_PERSON, type ViewMode } from '../player/playerCamera.ts';
import { SKY_NOW, type ToldSky } from '../sky/skyDriver.ts';
import { drawnWhole } from '../standIns.ts';
import { QA_EYE } from './camera.ts';
import { QA_SHIP } from './qaShip.ts';
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
  /** Sets out for the ship, as the menu's "Return to ship" does. */
  readonly sea?: () => void;
  /** The game's state, for a development page's picture steps: its flow says whether the player stands on foot. */
  readonly game?: { readonly flow: { readonly mode: string } };
  /** The sky drawn, which a told sky overrides. */
  readonly sky?: { told: ToldSky | null };
}

/** Says why a hook did nothing, where the driver prints it (it prints the console's errors), and answers false. */
function refused(hook: string, why: string): false {
  console.error(`${hook}: ${why}`);
  return false;
}

/** Stands the camera at any point (east, south, up), looking along a bearing and down so many degrees, on foot, at
 *  sea and in the story alike; null lets it go back to the player's. */
export function qaEye(eye: readonly number[] | null): boolean {
  QA_EYE.shot = eye && {
    eye: [eye[0] ?? 0, eye[1] ?? 0, eye[2] ?? 0],
    yaw: ((eye[3] ?? 0) * Math.PI) / 180,
    pitch: ((eye[4] ?? 0) * Math.PI) / 180,
  };
  return true;
}

/** Puts `__qaView(view)`, `__qaEye(eye)` and `__qaWhere()` on `target` for the picture driver, when the page plays
 *  alone (`offline`) and asks for a spawn, and on a development page (`dev`) `__qaLook(view)`, `__qaSea()`,
 *  `__qaSky(weather)` and `__qaShip(look)` too; a development page lends `__qaGame` whether it plays alone or in a
 *  live room. A view arrives again in the same node with its point as the spawn, as `&spawn=` does, then sets the
 *  camera. Each hook answers whether it did, and one that did nothing says why on the console. */
export function installQaViews(
  target: object,
  search: string,
  offline: boolean,
  host: QaHost,
  dev: boolean = import.meta.env?.DEV ?? false,
): void {
  // A development page lends the game it plays to the driver's steps, a live room's too.
  if (dev) Object.assign(target, { __qaGame: host.game });
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
  Object.assign(target, { __qaEye: qaEye });
  // `whole`: the last frames drew the place with nothing standing in, a layout's city built among it.
  hook.__qaWhere = () => {
    const { body } = host.walker.player;
    return { x: body.x, y: body.y, dead: host.dead?.() ?? false, whole: drawnWhole() };
  };
  if (!dev) return;
  // A development build's alone: turning the camera to a view without arriving again, so the room (and an event it
  // runs) plays on, the body staying; the way to sea; a told sky; and the game's state, which a picture's steps read
  // and drive.
  const lookAt = (view: QaView) => {
    const node = host.node();
    const look = node && qaLook(node.ring, view);
    if (!look) return false;
    host.walker.player = { ...host.walker.player, yaw: look.yaw, view: look.view, pitch: look.pitch };
    return true;
  };
  // The trip sets out only from on foot: under the arrival's veil, or already under way, it is not taken.
  const toSea = () => {
    const mode = host.game?.flow.mode;
    if (!host.sea) return refused('__qaSea', 'no way to sea lent');
    if (mode !== 'foot') return refused('__qaSea', `the player is ${mode ?? 'nowhere'}, not on foot`);
    host.sea();
    return host.game?.flow.mode === 'loading' || refused('__qaSea', 'the trip to the ship was not taken');
  };
  // The sky as told: the weather's parts given (`{ cloud: 1, falling: 1 }`) over the sky's own now, at world time
  // `worldS` (now unless given), its clouds held still; null gives the world's sky back.
  const tellSky = (weather: Partial<ToldSky['weather']> | null, worldS = SKY_NOW.current.worldS) => {
    const { reading } = SKY_NOW.current;
    if (!host.sky || !reading) return refused('__qaSky', host.sky ? 'the sky has not come yet' : 'no sky lent');
    host.sky.told = weather && {
      hourS: worldS,
      worldS,
      weather: Object.assign({ ...reading }, weather),
      strikes: [],
    };
    return true;
  };
  // The own ship's hull, dress and emblem (`{ hull: 2, dress: [2, 17, 25, 37], emblem: 4 }`); null lets it go.
  const dressShip = (look: (typeof QA_SHIP)['look']) => ((QA_SHIP.look = look), true);
  Object.assign(target, { __qaLook: lookAt, __qaSea: toSea, __qaSky: tellSky, __qaShip: dressShip });
}
