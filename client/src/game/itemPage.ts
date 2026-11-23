// An item's page, laid over the menu as Destiny 1's weapon page is: its name on a band of its rarity, its kind,
// level, an Atheric's intrinsic and own perk apart from its nodes, its words, its main number large over a meter of
// it, what it changes over the piece worn, the perks it gives, each beside its column's glyph, and its node grid,
// column by column, each node its kind's glyph in a tile: brass when chosen, lit when bought, glowing when it can be
// bought now, sunk while locked, a ring inside it filling as the item grows toward it, its card on hover or focus. A
// node is bought by holding it, as Destiny holds an upgrade; one bought is chosen by a click. To the right, the item
// itself drawn large on a lit floor; what may be done with it goes to the menu's footer.

import { edged } from '../combat/barDraw.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { CARRIED, type NodeShown, RARITIES, WORN } from '../player/gear.ts';
import { LARGE_CAP } from '../player/iconFit.ts';
import type { Child, Node } from '../ui/node.ts';
import { cardFrame, cardName, compareNode, kindLine, rarityTone, traitNode } from './gearCard.ts';
import { ATHERIC_OWN, cardOf, intrinsicOf, ownOf, traitsShown } from './gearCards.ts';
import { HOLD_MS, dismantleMs, fillNode, quiver } from './gearHold.ts';
import {
  INK,
  focusRing,
  glyphNode,
  label,
  nodeGlyphNode,
  over,
  pictureNode,
  pressNode,
  rarityRgb,
  rgba,
  ringNode,
  words,
} from './gearNodes.ts';
import { itemDetailOf } from './gearScreen.ts';
import type { MenuContext } from './menuPage.ts';
import { moduleGlyph } from './shipGear.ts';

/** The art's box: what the page's height leaves it, within these, in pixels. */
const ART_LEAST = 200;
const ART_MOST = 560;
const ART_AROUND = 110;
/** The most an item's Attack and Prestige reach, for their meters. */
const ATTACK_MOST = 300;
const PRESTIGE_MOST = 30;
/** A module's glyph on its page, in pixels: its 24 cells at eleven times. */
const GLYPH_PX = 264;
/** A node's tile, in pixels. */
const NODE_TILE = 44;
/** The words' column, in pixels: the least it takes, and the most at the first words' size and at the larger; then the
 *  page's edge, the body's padding across and the gap before the art. The column takes what room it can within those
 *  and the art the rest, as a grid's `minmax(380px, 660px) 1fr` lays them. */
const WORDS_LEAST = 380;
const WORDS_MOST = 660;
const WORDS_MOST_LARGE = 880;
const PAGE_EDGE = 2;
const BODY_ACROSS = 24;
const ART_GAP = 32;
/** The id of the item's art, which charges as a hold on its page is held. */
export const ITEM_ART = 'item-art';
/** The id of the item's name, which takes the focus as its page opens, so the page is read from it. */
export const ITEM_NAME = 'item-name';

/** A meter sunk into the page, filled to `share`; with `value`, its label and value beside it. */
export function bar(context: Pick<MenuContext, 'sizes'>, said: string, share: number, value = ''): Node {
  const size = context.sizes.label;
  const well: Node = {
    width: 'grow',
    height: 10,
    padding: 2,
    role: 'well',
    label: said,
    children: [{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`, height: 'grow', fill: '#d9d0ae' }],
  };
  if (!value) return { width: 'grow', padding: [4, 0], children: [well] };
  return {
    width: 'grow',
    gap: 10,
    alignY: 'center',
    padding: [4, 0],
    children: [
      { width: size > 1 ? 110 : 76, children: [words(said, size, INK.faint)] },
      well,
      { width: 64, alignX: 'end', children: [words(value, size, INK.word)] },
    ],
  };
}

/** A node's card: its name and words, and whether it is chosen or bought, what it costs, or when it unlocks. */
function nodeCard(context: MenuContext, node: NodeShown): Node {
  const state = node.chosen
    ? 'Chosen'
    : node.bought
      ? 'Bought: click to choose'
      : node.unlocked
        ? 'Hold to buy'
        : 'Locked';
  const size = context.sizes.label;
  return cardFrame(
    context.sizes,
    rarityTone(null),
    [cardName(node.label, null), words(state, size, INK.word)],
    [{ width: 'grow', text: { words: node.words, size, colour: INK.faint } }],
    [],
    {
      width: 'grow',
      padding: [7, 12, 8, 12],
      children: [{ width: 'grow', text: { words: node.cost, size, colour: INK.faint } }],
    },
  );
}

/** One node's press: held to buy, clicked to choose, and otherwise reachable but doing nothing, so its card says why;
 *  locked, its ring grown `share` of the way to it. */
function nodePress(
  context: MenuContext,
  item: Pick<GearItem, 'rarity'>,
  node: NodeShown,
  [kind, share]: readonly [number, number],
  id: string,
): Node {
  const { ui, holds } = context;
  const state = node.chosen ? 'chosen' : node.bought ? 'bought' : node.unlocked ? 'open' : 'locked';
  const run = () => {
    if (node.ask) context.ask(node.ask);
  };
  const held = !node.bought && node.ask !== null;
  const charged = held ? holds.press(ui, id, run) : 0;
  // Asked every frame, so a hold let go off its press is forgotten.
  const justHeld = holds.heldDown(ui, id);
  if (!held && ui.clicked(id) && !justHeld) run();
  context.card(id, () => nodeCard(context, node), 'nodes');
  const found = RARITIES[item.rarity];
  const hover = ui.hovered(id) && node.ask !== null;
  const [bevel, ground, glyph]: [[string, string, string, string], string, string] =
    state === 'locked'
      ? [[INK.stoneLo, INK.stoneHi, INK.stoneHi, INK.stoneLo], '#0b0c0f', '#6a6458']
      : state === 'chosen'
        ? [['#f6dca4', '#8a5f17', '#8a5f17', '#f6dca4'], '#c99a4e', '#1a120a']
        : state === 'open'
          ? [
              [
                found?.lit ?? INK.brassLit,
                found?.shade ?? INK.brass,
                found?.shade ?? INK.brass,
                found?.lit ?? INK.brassLit,
              ],
              INK.well,
              found?.lit ?? INK.brassLit,
            ]
          : [[INK.stoneHi, INK.stoneLo, INK.stoneLo, INK.stoneHi], INK.well, INK.brassLit];
  const lit: [string, string, string, string] = [INK.brassLit, INK.brassLit, INK.brassLit, INK.brassLit];
  return {
    id,
    press: true,
    disabled: node.ask === null && !node.bought,
    label: `${node.label}, ${state}: ${node.cost}`,
    width: NODE_TILE,
    height: NODE_TILE,
    alignX: 'center',
    alignY: 'center',
    fill: ground,
    draw: edged(hover && state !== 'chosen' ? lit : bevel, 2, state === 'chosen' ? INK.outline : null),
    children: [
      state === 'open' && {
        width: 'grow',
        height: 'grow',
        float: { to: 'parent' },
        outline: { width: 2, colour: rgba(rarityRgb(item.rarity), 0.35) },
      },
      state === 'locked' && {
        ...ringNode(share, INK.brassLit, '#2a2620', NODE_TILE - 4),
        float: { to: 'parent', x: 2, y: 2 },
      },
      nodeGlyphNode(kind, glyph),
      held ? fillNode(charged) : null,
      ui.focused(id) && ui.keyFocused && focusRing(NODE_TILE, NODE_TILE),
    ],
  };
}

/** The node grid: each column's nodes, their rings grown as far as the item has from the column before's; an
 *  officer's too, their service as its XP and their grade as its rarity. */
export function nodeGrid(
  context: MenuContext,
  item: Pick<GearItem, 'columns' | 'xp' | 'rarity'>,
  columns: ReturnType<typeof itemDetailOf>['columns'],
): Node {
  return {
    id: 'nodes',
    gap: 14,
    children: columns.map((column, index): Node => {
      const kind = item.columns[index]?.kind ?? 3;
      const unlocks = item.columns[index]?.xp ?? 0;
      const after = index === 0 ? 0 : (item.columns[index - 1]?.xp ?? 0);
      const share = Math.min(1, Math.max(0, unlocks <= after ? 1 : (item.xp - after) / (unlocks - after)));
      return {
        width: 48,
        direction: 'column',
        alignX: 'center',
        gap: 8,
        children: column.nodes.map((node, nth) =>
          nodePress(context, item, node, [kind, share], `node-${index}-${nth}`),
        ),
      };
    }),
  };
}

/** A heading over a rule, naming a part of the page. */
function heading(said: string, size: number): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 4,
    padding: [16, 0, 10, 0],
    children: [label(said, size), { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' }],
  };
}

/** The item's page, laid over the menu's body, and its presses for the menu's footer. */
export function itemPage(
  context: MenuContext,
  item: GearItem,
  back: () => void,
): { readonly page: Node; readonly presses: readonly Node[] } {
  const { ui, holds, sizes, room } = context;
  const detail = itemDetailOf(item, context.gear, context.atVault);
  const rgb = rarityRgb(item.rarity);
  const size = sizes.label;
  const main = item.attack
    ? { label: 'Attack', value: item.attack, most: ATTACK_MOST }
    : item.defense
      ? { label: 'Defense', value: item.defense, most: 0 }
      : null;
  const worn = item.at === CARRIED ? context.gear.items.find((each) => each.at === WORN + item.bucket) : undefined;
  const compare = worn ? cardOf(item, worn).compare : null;
  const traits = traitsShown(item).filter((trait) => trait.kind !== ATHERIC_OWN);
  // An Atheric's two perks of its own head its page together, its own node's shown even before it is chosen.
  const atheric = [intrinsicOf(item), ownOf(item)].filter((trait) => trait !== null);
  const left: Child[] = [
    atheric.length > 0 && heading('Atheric', size),
    ...atheric.map((trait) => traitNode(trait, size)),
    detail.words !== '' && { width: 'grow', padding: [4, 0], text: { words: detail.words, size, colour: INK.faint } },
    main && {
      gap: 8,
      alignY: 'end',
      padding: [8, 0, 6, 0],
      children: [words(String(main.value), 5, INK.word), { padding: [0, 0, 12, 0], children: [label(main.label, 1)] }],
    },
    main?.most ? bar(context, main.label, main.value / main.most) : null,
    item.prestige ? bar(context, 'Prestige', item.prestige / PRESTIGE_MOST, String(item.prestige)) : null,
    compare && compareNode(compare, size, size > 1),
    traits.length > 0 && heading('Perks', size),
    ...traits.map((trait) => traitNode(trait, size)),
    detail.columns.length > 0 && heading('Nodes', size),
    detail.columns.length > 0 && nodeGrid(context, item, detail.columns),
  ];
  const box = Math.min(ART_MOST, Math.max(ART_LEAST, room.height - ART_AROUND));
  // The page stands over the menu's body, as wide as it.
  const wordsRoom = (ui.boxOf('gear-body')?.width ?? 0) - 2 * (PAGE_EDGE + BODY_ACROSS) - ART_GAP;
  const picture = context.picture(item);
  // A module's glyph stands for its picture, drawn large at eleven times its cells, in the middle of the art's box.
  const glyph = moduleGlyph(item.kind);
  const drawn = glyph
    ? glyphNode(glyph, GLYPH_PX)
    : picture
      ? pictureNode(picture, box, sizes.ratio, LARGE_CAP)
      : words('Drawing…', 1, INK.faint);
  const shaken = quiver(holds.share(ITEM_ART));
  const found = RARITIES[item.rarity];
  const nameColour = item.rarity === 0 ? found?.colour : found?.lit;
  const page: Node = {
    id: 'item-page',
    width: 'grow',
    height: 'grow',
    direction: 'column',
    fill: INK.ground,
    solid: true,
    padding: PAGE_EDGE,
    float: { to: 'parent', z: 25 },
    picture: {
      key: `item glow ${rgb}`,
      source: {
        draw: (drawing, across, down) => {
          const [wide, tall] = [across * 0.5, down * 0.6];
          drawing.translate(across * 0.76, down * 0.46);
          drawing.scale(1, tall / wide);
          const glow = drawing.createRadialGradient(0, 0, 0, 0, 0, wide);
          glow.addColorStop(0, rgba(rgb, 0.1));
          glow.addColorStop(1, rgba(rgb, 0));
          drawing.fillStyle = glow;
          drawing.fillRect(-wide, -wide, 2 * wide, 2 * wide);
        },
      },
    },
    children: [
      {
        width: 'grow',
        direction: 'column',
        padding: [14, 24, 12, 24],
        fill: over(rgb, 0.29, '#15171c'),
        children: [
          {
            id: ITEM_NAME,
            focusable: true,
            label: detail.name,
            text: { words: detail.name, size: 3, colour: nameColour ?? INK.word, wrap: false },
          },
          {
            padding: [6, 0, 0, 0],
            children: [
              kindLine(detail.kind, item.rarity, item.element, size, [
                { role: 'chip', padding: [1, 8], children: [words(`Level ${item.level}`, 1, INK.word)] },
              ]),
            ],
          },
        ],
      },
      { width: 'grow', height: 1, fill: rgba(rgb, 0.45) },
      {
        id: 'item-body',
        width: 'grow',
        height: 'grow',
        scroll: true,
        padding: [14, BODY_ACROSS, 18, BODY_ACROSS],
        gap: ART_GAP,
        children: [
          {
            id: 'item-words',
            width: Math.min(size > 1 ? WORDS_MOST_LARGE : WORDS_MOST, Math.max(WORDS_LEAST, wordsRoom)),
            direction: 'column',
            children: left,
          },
          {
            id: ITEM_ART,
            width: 'grow',
            height: 'grow',
            minHeight: box,
            alignX: 'center',
            alignY: glyph ? 'center' : 'end',
            picture: {
              key: `item floor ${rgb}`,
              source: {
                draw: (drawing, across, down) => {
                  const [wide, tall] = [across * 0.36, down * 0.07];
                  drawing.save();
                  drawing.translate(across / 2, down * 0.92);
                  drawing.scale(1, tall / wide);
                  const floor = drawing.createRadialGradient(0, 0, 0, 0, 0, wide);
                  floor.addColorStop(0, rgba(rgb, 0.4));
                  floor.addColorStop(1, rgba(rgb, 0));
                  drawing.fillStyle = floor;
                  drawing.fillRect(-wide, -wide, 2 * wide, 2 * wide);
                  drawing.restore();
                  const light = drawing.createRadialGradient(
                    across / 2,
                    down * 0.55,
                    0,
                    across / 2,
                    down * 0.55,
                    Math.hypot(across, down) * 0.29,
                  );
                  light.addColorStop(0, rgba(rgb, 0.14));
                  light.addColorStop(1, rgba(rgb, 0));
                  drawing.fillStyle = light;
                  drawing.fillRect(0, 0, across, down);
                },
              },
            },
            // Stood a tenth of the art's width off its foot, so the floor's light shows under it.
            children: [
              {
                padding: [0, 0, glyph ? 0 : Math.round((ui.boxOf(ITEM_ART)?.width ?? 0) * 0.1), 0],
                children: [shaken ? { ...drawn, offset: shaken } : drawn],
              },
            ],
          },
        ],
      },
    ],
  };
  if (ui.clicked('press-back')) back();
  const presses: Node[] = [pressNode('press-back', 'Back', 'button', 'Esc', sizes.label)];
  for (const [place, press] of detail.presses.entries()) {
    // Two like modules to infuse share a name; an id is the frame's own (ui/node.ts), so the second takes its place.
    const named = `press-${press.label}`;
    const id = presses.some((each) => each.id === named) ? `${named} ${place}` : named;
    const run = () => context.ask(press.ask);
    let charged = 0;
    if (press.held)
      // Dismantling or feeding, the item's own picture charges as the press is held, a piece as long as its rarity asks.
      charged = holds.press(ui, id, run, {
        charges: press.burst ? ITEM_ART : id,
        burst: press.burst ?? null,
        ms: press.burst === 'shatter' ? dismantleMs(item.rarity) : HOLD_MS,
        rgb,
      });
    else if (ui.clicked(id)) run();
    presses.push(
      pressNode(id, press.label, press.role, '', sizes.label, {
        children: [press.held ? fillNode(charged, press.role === 'warn') : null],
      }),
    );
  }
  return { page, presses };
}
