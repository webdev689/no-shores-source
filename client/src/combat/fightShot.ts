// A fight's display with every piece showing, for checking it headless (`tools/uiShot.mjs`): the vitals low and
// flashing with buffs under them, the Art's abilities and both weapons, the compass, a boss bar and the target's plate,
// plates over a crowd of foes of each rank with a shield's ward and debuffs, a parry ring and an iron mark, an arrow to
// a threat off the screen, the crosshair charging with its shots, the words of blows, and, in its own shot, the veil.
// The game never imports it.
import { viewProjection } from '../editor/orbit.ts';
import type { FightEvent } from '../network/messages.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { abilityPictures } from '../player/artGlyphs.ts';
import { KINDS, WORN } from '../player/gear.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { cameraOf } from './plateSight.ts';
import type { MarkedFoe } from './foePlate.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { Hud, type HudFrame } from './hud.ts';

const PLAYER = 1;

const body: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'foes',
  arms: 0,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target: null,
  action: { kind: 'idle' },
};

const telegraph = (elapsed: number, windup: number, iron: boolean): Action => ({
  kind: 'telegraph',
  shape: 'sweep',
  elapsed,
  windup,
  origin: [0, 0, 0],
  bearing: 0,
  ahead: 1,
  iron,
  feintAt: null,
});

const item = (kind: string, slot: number, rarity: number): GearItem => ({
  id: 10 + slot,
  kind: KINDS.indexOf(kind as (typeof KINDS)[number]),
  rarity,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  xp: 0,
  xpMost: 1,
  bought: 0,
  chosen: [],
  bucket: slot,
  at: WORN + slot,
  attack: 10,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
  source: 0,
});

const gear: GearState = {
  xp: 0n,
  level: 1,
  prestige: 0,
  defense: 0,
  aurem: 0,
  stocks: [],
  resources: [],
  items: [item('sword', 0, 2), item('crossbow', 1, 1)],
  vestiges: [],
  drops: [],
  spent: [],
  atMage: false,
  answer: 0,
  answered: 0,
  identified: 0,
  nodes: [],
  wares: [],
  ammo: 4,
  ammoMost: 24,
};

const hit = (striker: number, defender: number, amount: number, more: Partial<FightEvent> = {}): FightEvent => ({
  tick: 0n,
  kind: 1,
  how: 0,
  striker,
  defender,
  amount,
  stroke: 2,
  ...more,
});

/** The scene's frames for a view `width` by `height`: each a frame of the display and the seconds since the last.
 *  With `dead`, the player has fallen and the veil is up. */
export function fightScene(width: number, height: number, dead = false): { frame: HudFrame; seconds: number }[] {
  const matrix = viewProjection(
    { targetX: 0, targetY: 0, targetZ: 1.7, yaw: 0, pitch: 0, distance: 0.5 },
    width / height,
  );
  const camera = cameraOf(matrix);
  const [eye, forward] = camera ? [camera.eye, camera.forward] : [[0, 0, 0] as const, [0, -1, 0] as const];
  const ahead = (along: number, aside: number) => ({
    x: eye[0] + forward[0] * along - forward[1] * aside,
    y: eye[1] + forward[1] * along + forward[0] * aside,
  });
  const foe = (
    id: number,
    name: string,
    rank: number,
    place: { x: number; y: number },
    more: Partial<MarkedFoe>,
    view: Partial<FighterView> = {},
  ): MarkedFoe => ({
    id,
    name,
    rank,
    faction: 'The Grey Tithe',
    phase: 1,
    alert: 2,
    level: 4 + rank,
    view: { ...body, ...place, health: 60 * rank, healthMax: 60 * rank, ...view },
    ...more,
  });
  const own: FighterView = {
    ...body,
    side: 'players',
    health: dead ? 0 : 22,
    stamina: 0,
    poise: 14,
    target: 13,
    ammo: 4,
    statuses: { crit: 300, expose: 0, charge: 0, haste: 600, linked: 0, veiled: 0, chargeImmune: 0 },
    action: dead ? { kind: 'dead', elapsed: 60 } : { kind: 'idle' },
  };
  const foes = (struck: boolean): MarkedFoe[] => [
    foe(11, 'Deckhand', 1, ahead(9, -3.2), { alert: 1 }, { health: 40 }),
    foe(12, 'Corsair Gunner', 2, ahead(8, 0.4), {}, { health: struck ? 70 : 120 }),
    foe(
      13,
      'Tithe Warden',
      3,
      ahead(10, 3.4),
      { shield: { element: 2, left: 60, most: 120 }, statuses: { expose: 400, charge: 200, chargeImmune: 0 } },
      { health: struck ? 90 : 150, poise: 20, target: PLAYER, action: telegraph(30, 40, false) },
    ),
    foe(14, 'Captain Brannoc Thule', 5, ahead(24, -7), { phase: 2 }, { health: 180, healthMax: 300 }),
    foe(15, 'Deckhand', 1, ahead(-6, 3), {}, { target: PLAYER, action: telegraph(5, 40, false) }),
    foe(16, 'Brute', 2, ahead(6, -6), {}, { target: PLAYER, action: telegraph(5, 60, true) }),
  ];
  const frame = (struck: boolean, events: readonly FightEvent[]): HudFrame => {
    const shown = foes(struck);
    return {
      own,
      foes: shown,
      where: (id) => {
        const view = id === PLAYER ? own : shown.find((each) => each.id === id)?.view;
        return view ? [view.x, view.y, view.z] : null;
      },
      matrix,
      width,
      height,
      events,
      player: PLAYER,
      firstPerson: false,
      pressed: true,
      lost: null,
      groundAt: null,
      crosshair: { reticle: 'bow', charge: 0.6, reach: null },
      ammo: 4,
      ammoMost: 24,
      abilities: { art: 1, animaShare: 0.6, tenets: [0.35, 1] },
      arms: { gear, loadout: 0, drawn: true, dress: null },
    };
  };
  return [
    { frame: frame(false, []), seconds: 1 / 60 },
    {
      frame: frame(true, [hit(PLAYER, 12, 50), hit(PLAYER, 13, 60, { crit: true, element: 2 }), hit(14, PLAYER, 22)]),
      seconds: 1 / 60,
    },
    ...Array.from({ length: 10 }, () => ({ frame: frame(true, []), seconds: 1 / 60 })),
  ];
}

/** The Art's pictures the scene's ability bar draws. */
export const scenePictures = abilityPictures;

/** The display after the scene's frames, at `width` by `height`, kept so each frame of a shot draws the same. */
const huds = new Map<string, Hud>();
function sceneHud(width: number, height: number, dead = false): Hud {
  const key = `${width}x${height}${dead ? ' dead' : ''}`;
  let hud = huds.get(key);
  if (!hud) {
    Math.random = () => 0.5;
    hud = new Hud(scenePictures, null);
    for (const { frame, seconds } of fightScene(width, height, dead)) hud.update(frame, seconds);
    huds.set(key, hud);
  }
  return hud;
}

const shown = (hud: Hud, ui: Interface): Node => ({ width: 'grow', height: 'grow', children: [hud.node(ui)] });
export const fightShot = (ui: Interface): Node => shown(sceneHud(1280, 720), ui);
export const fightWideShot = (ui: Interface): Node => shown(sceneHud(1600, 900), ui);
export const fightNarrowShot = (ui: Interface): Node => shown(sceneHud(900, 600), ui);
export const fightDeadShot = (ui: Interface): Node => shown(sceneHud(1280, 720, true), ui);
