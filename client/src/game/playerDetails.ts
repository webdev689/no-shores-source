import type { Details } from '../network/accounts.ts';
import { RARITIES, SLOTS, capital, itemName } from '../player/gear.ts';
import type { Node } from '../ui/node.ts';
import { emblemOf } from './emblemArt.ts';
import {
  INK,
  elementNode,
  focusRing,
  itemIconNode,
  plateNode,
  pressNode,
  tileLabel,
  tileNode,
  words,
} from './gearNodes.ts';
import type { PlainContext } from './menuPage.ts';
import { headingNode } from './menuPages.ts';
import { placeWords } from './rosterRows.ts';

/** How large a worn piece's tile stands, in pixels; the least a worn piece's column takes, and the page's most. */
const TILE_PX = 64;
const PIECE_PX = 220;
const PAGE_PX = 760;

/** The press back from a player's details to the Roster's columns. */
export const DETAILS_BACK = 'roster-back';

/**
 * Another player's details, as Destiny's Inspect shows them: their nameplate, their guild, where they are (to their
 * friends, company and guild alone), their power, and each piece they wear in its rarity, with its element and gilding.
 */
export function detailsNode({ ui, room, sizes }: PlainContext, found: Details, back: () => void): Node {
  const emblem = emblemOf(found.shown?.emblem ?? found.emblem);
  const level = found.shown?.level ?? found.level;
  const facts: (readonly [string, string])[] = [
    ['Where', found.place !== null ? placeWords(found.place) : found.playing ? 'Playing' : 'Away'],
  ];
  if (found.guild) facts.push(['Guild', `[${found.guild.tag}] ${found.guild.name} · ${found.guild.rank}`]);
  if (found.guild?.motto) facts.push(['Motto', found.guild.motto]);
  if (found.shown) facts.push(['Attack', String(found.shown.attack)], ['Defense', String(found.shown.defense)]);
  // The pieces stand in as many columns of at least 220 pixels as the page has room for, sharing it.
  const inner = Math.min(PAGE_PX, room.width) - 36;
  const columns = Math.max(1, Math.floor((inner + 16) / (PIECE_PX + 16)));
  const pieceWidth = Math.floor((inner - 16 * (columns - 1)) / columns);
  const pieces = (found.shown?.worn ?? []).map((piece, index): Node => {
    const item = { named: piece.named ?? null, kind: piece.kind, rarity: piece.rarity, name: piece.name };
    // A piece the page cannot name still shows, by its slot.
    const pieceName = itemName(item) || capital(SLOTS[piece.slot] ?? 'Piece');
    const element = elementNode(piece.element, 16);
    const power = piece.attack ? `${piece.attack} Attack` : `${piece.defense} Defense`;
    const id = `worn-${index}`;
    return {
      width: pieceWidth,
      gap: 10,
      alignY: 'center',
      children: [
        tileNode(
          TILE_PX,
          piece.rarity,
          ui.hovered(id) ? 'lit' : 'rest',
          [itemIconNode(null, pieceName, TILE_PX, sizes, piece.rarity)],
          {
            id,
            focusable: true,
            label: tileLabel(pieceName, piece.rarity),
            gilded: piece.gilded,
            marks: [
              element && { ...element, float: { to: 'parent', anchor: [1, 0], at: [1, 0], x: -3, y: 3 } },
              ui.focused(id) && ui.keyFocused && focusRing(TILE_PX, TILE_PX),
            ],
          },
        ),
        {
          width: 'grow',
          direction: 'column',
          gap: 2,
          children: [
            words(capital(SLOTS[piece.slot] ?? '').toUpperCase(), 1, INK.faint, { tracking: 3 }),
            words(pieceName, 1, INK.word, { ellipsis: true }),
            words(`${RARITIES[piece.rarity]?.name ?? ''} · ${power}`, 1, INK.faint, { ellipsis: true }),
          ],
        },
      ],
    };
  });
  if (ui.clicked(DETAILS_BACK)) back();
  return {
    width: 'grow',
    alignX: 'center',
    padding: [12, 0],
    children: [
      {
        id: 'roster-details',
        role: 'panel',
        width: 'grow',
        maxWidth: PAGE_PX + 4,
        direction: 'column',
        padding: [2, 2, 18, 2],
        children: [
          plateNode(emblem, 96, 110, [
            {
              gap: 10,
              alignY: 'end',
              children: [
                words(found.name, 3, INK.word, { edge: 'shadow', edgeColour: '#000' }),
                found.tag !== null &&
                  found.tag !== '' &&
                  words(`[${found.tag}]`, 3, 'rgba(242,239,230,0.7)', { edge: 'shadow', edgeColour: '#000' }),
              ],
            },
            words(level === null ? emblem.name : `Level ${level} · ${emblem.name}`, 1, INK.word, {
              edge: 'shadow',
              edgeColour: '#000',
            }),
          ]),
          {
            width: 'grow',
            direction: 'column',
            gap: 6,
            padding: [16, 18],
            children: facts.map(([term, value]): Node => ({
              width: 'grow',
              gap: 14,
              children: [
                { width: 110, ...words(term.toUpperCase(), 1, INK.faint, { tracking: 3 }) },
                { width: 'grow', text: { words: value, colour: INK.word } },
              ],
            })),
          },
          { width: 'grow', padding: [0, 18, 8, 18], children: [headingNode('Worn')] },
          {
            width: 'grow',
            wrap: true,
            gap: 16,
            padding: [0, 18, 16, 18],
            children: found.shown
              ? pieces
              : [{ text: { words: 'They have not played online yet.', colour: INK.faint } }],
          },
          { padding: [0, 18], children: [pressNode(DETAILS_BACK, 'Back', 'button', 'Esc', 1, { padding: [6, 14] })] },
        ],
      },
    ],
  };
}
