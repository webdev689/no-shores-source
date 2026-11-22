// Pictures of the plates over other players, the interact menu and the chat, headless (`tools/uiShot.mjs`), over a
// plain dusk in place of the world. The game never imports it.
import type { Details } from '../../network/accounts.ts';
import type { PlayerPlate } from '../../network/plateMessages.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { ChatLog } from './chatLog.ts';
import { ChatPanel } from './chatPanel.ts';
import { InspectWindow } from './inspectWindow.ts';
import { interactNode, interactRows } from './interactMenu.ts';
import { type PlatedPlayer, PlayerPlates } from '../../combat/playerPlates.ts';

const DUSK = '#3d4a58';

const plate = (player: number, name: string, level: number, prestige: number, menu = false): PlayerPlate => ({
  player,
  name,
  level,
  prestige,
  menu,
});

/** Four players east of the eye: a stranger at level 6 close by, aimed at and Use half held; a company member past
 *  level 20 showing their Prestige; one with a menu open; and a guest, nameless, farther off. */
const PLAYERS: readonly PlatedPlayer[] = [
  { id: 1, feet: [4, 0, 0], plate: plate(1, 'WoodenOsprey782', 6, 0), company: false },
  { id: 2, feet: [9, -4, 0], plate: plate(2, 'ChiefKabr', 24, 84), company: true },
  { id: 3, feet: [12, 5, 0], plate: plate(3, 'xDR_EXOx', 6, 0, true), company: false },
  { id: 4, feet: [30, -9, 0], plate: plate(4, '', 3, 0), company: false },
];

/** The plates as the HUD lays them for a camera at the origin looking east, its view `width` by `height`. */
export function platesShot(ui: Interface): Node {
  const { width, height } = ui.size;
  const plates = new PlayerPlates();
  const focal = 1.7;
  const spot = (point: readonly [number, number, number]) => {
    const depth = point[0];
    if (depth <= 0.1) return null;
    const x = width / 2 + ((point[1] * focal) / depth) * (height / 2);
    const y = height / 2 - (((point[2] - 1.6) * focal) / depth) * (height / 2);
    return { x, y, depth };
  };
  const camera = { eye: [0, 0, 1.6] as const, forward: [1, 0, 0] as const, focal };
  plates.update(PLAYERS, { camera, blocked: () => false, spot, own: [1, 0, 0] }, 1);
  plates.offer = { held: 0.4 };
  return { width: 'grow', height: 'grow', fill: DUSK, children: plates.nodes() };
}

/** The menu holding Use opens on a stranger, as the Roster would offer it to a guild's founder leading no company. */
export function interactShot(ui: Interface): Node {
  const ada = { name: 'Ada', tag: 'SWK', emblem: null, level: 12, place: 'node-overlook-social' };
  const guild = { name: 'The Saltwake', tag: 'SWK', motto: '', rank: 'Founder', members: [], invited: [] };
  const roster = {
    me: ada,
    privacy: 'Friends Only',
    company: null,
    invites: [],
    nearby: [],
    guests: 0,
    friends: [],
    asking: [],
    asked: [],
    guild,
    guildInvites: [],
    blocked: [],
  };
  const person = { name: 'WoodenOsprey782', tag: null, emblem: null, level: 6, place: 'node-overlook-social' };
  const rows = interactRows(roster, person, '');
  const player = PLAYERS[0];
  if (!player) throw new Error('no player to show');
  const said = 'Add friend: done.';
  const menu = interactNode(
    ui,
    player,
    rows,
    said,
    false,
    () => undefined,
    () => undefined,
  );
  return { width: 'grow', height: 'grow', fill: DUSK, children: [menu] };
}

const log = new ChatLog();
const near = () => true;
log.told('Welcome! Type /help for chat commands.', 0);
log.heard({ channel: 'world', from: 'ChiefKabr', text: 'Anyone for the Elite Dungeon tonight?' }, 0, 'Ada', near);
log.heard({ channel: 'local', from: 'WoodenOsprey782', text: 'Nice cloak. Where did you get it?' }, 0, 'Ada', near);
log.heard({ channel: 'local', from: 'Ada', text: 'The Tailor, this morning.' }, 0, 'Ada', near);
log.heard({ channel: 'whisper', from: 'xDR_EXOx', to: 'Ada', text: 'Invite me when you go?' }, 0, 'Ada', near);
log.heard({ channel: 'whisper', from: 'Ada', to: 'xDR_EXOx', text: 'Sure, in five.' }, 0, 'Ada', near);
log.heard(
  { channel: 'region', from: 'ChiefKabr', region: 'The Lantern Sea', text: 'Grey Tithe frigate off the reef' },
  0,
  'Ada',
  near,
);
log.heard({ channel: 'local', from: 'WoodenOsprey782', text: `look${'o'.repeat(60)}ut!` }, 0, 'Ada', near);
const relation = (name: string) =>
  name === 'Ada' ? 'mine' : name === 'ChiefKabr' ? 'company' : name === 'xDR_EXOx' ? 'friend' : 'other';

/** The chat open, on Local, its field empty. */
const open = new ChatPanel();
open.show();
export function chatOpenShot(ui: Interface): Node {
  const chat = open.node(ui, log, 0, ui.size, relation, () => 'keep');
  return { width: 'grow', height: 'grow', fill: DUSK, children: [chat] };
}

/** The chat shut, its newest lines a quarter of the way into their fade. */
const shut = new ChatPanel();
export function chatShutShot(ui: Interface): Node {
  const chat = shut.node(ui, log, 17_000, ui.size, relation, () => 'keep');
  return { width: 'grow', height: 'grow', fill: DUSK, children: [chat] };
}

/** The chat open at sea in the Lantern Sea, on Region. */
const atSea = new ChatPanel();
atSea.place(true, 'The Lantern Sea');
atSea.show();
export function chatAtSeaShot(ui: Interface): Node {
  const chat = atSea.node(ui, log, 0, ui.size, relation, () => 'keep');
  return { width: 'grow', height: 'grow', fill: DUSK, children: [chat] };
}

/** Inspect on a player past level 20 wearing two kept pieces, one gilded, and an Art; no forge, so no pictures. */
const piece = (slot: number, gilded: boolean) => ({
  slot,
  kind: 2,
  rarity: 3,
  level: 22,
  name: 4,
  element: 1,
  attack: slot === 0 ? 310 : 0,
  defense: slot === 0 ? 0 : 60,
  gilded,
});
const inspected: Details = {
  name: 'ChiefKabr',
  tag: 'SWK',
  emblem: 'stormborn',
  level: 24,
  place: null,
  playing: true,
  guild: null,
  shown: {
    level: 24,
    defense: 60,
    attack: 310,
    emblem: 'stormborn',
    worn: [piece(0, true), piece(3, false)],
    prestige: 84,
    art: 1,
    art_level: 4,
  },
};
const inspect = new InspectWindow(() => null);
export function inspectShot(ui: Interface): Node {
  const window = inspect.node(ui, ui.size, { name: 'ChiefKabr', details: inspected, dress: null }, () => undefined);
  return { width: 'grow', height: 'grow', fill: DUSK, children: [window] };
}
