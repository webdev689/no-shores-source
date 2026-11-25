// The Art's screen, after Destiny's subclass screen: the Art's scene drawn behind it, its drama at the right; at the
// left the worn Art's name, its diamond large in a double frame, the three Arts' diamonds to wear another and its
// words; in the middle its ANIMA, its two TENETS and its CORE in rows of the menu's tiles, framed in its element, the
// Core's fragments written out under it (artsRows.ts). Each spell and fragment shows its card beside its row on hover
// or focus; the arrows move between the tiles, Enter chooses, Escape closes the flyout and then the screen. Every change
// is an ask the room answers; the screen shows the Art and Core the room last sent. It comes in as it opens, its
// emblem opening from its middle; another Art worn flashes it in its colour. An Art its road has not earned stands
// locked, saying which road earns it.

import { earnedOf } from '../network/artMessages.ts';
import { motionReduced } from '../plus/kit.ts';
import { LOCK_MAP, mapSvg } from '../player/artGlyphs.ts';
import { earnedOn } from '../player/factionNames.ts';
import { ELEMENTS } from '../player/gear.ts';
import type { Node } from '../ui/node.ts';
import { artStage, focusOf } from './artStage.ts';
import { ARTS, type Art, type ArtsAsk, artCard, artOf, emblemSvg, frameSvg } from './artsCards.ts';
import { LEVEL_MOST, barWords, factionOf, levelOf, ready, shareWords } from './artLevels.ts';
import { ARTS_HINTS, type ArtLook, artsRows, lookOf, pipsNode, stepped } from './artsRows.ts';
import { emblemOf } from './emblemArt.ts';
import { cardNode } from './gearCard.ts';
import { INK, elementNode, emblemNode, focusRing, svgNode, words } from './gearNodes.ts';
import type { MenuContext } from './menuPage.ts';
import { play } from './uiSounds.ts';

export { ARTS_HINTS };

/** The key of the Character page's diamond, which takes the focus back once the screen closes. */
export const ART_DIAMOND_KEY = 'art-diamond';
/** The screen's own id, whose age is how long it has stood open. */
const PAGE = 'arts-page';

/** What the screen is given beyond the menu's context: the Core slot whose flyout is open (null for none) and the way
 *  to open or close one, the slot whose ask waits on the room's word, and the way to ask the room for a change. */
export interface ArtsState {
  readonly open: number | null;
  readonly choose: (slot: number | null) => void;
  readonly pending: number | null;
  readonly ask: (ask: ArtsAsk) => void;
  /** Gives the focus to `id` once it is drawn. */
  readonly focus: (id: string) => void;
}

/** A diamond's ring round an Art's diamond `size` pixels a side, in `colour` over a dark line: the worn Art's, and
 *  the focused one's. */
function diamondRing(size: number, colour: string): Node {
  const whole = size + 8;
  const middle = whole / 2;
  const points = (reach: number) =>
    `${middle},${middle - reach} ${middle + reach},${middle} ${middle},${middle + reach} ${middle - reach},${middle}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${whole} ${whole}">` +
    `<polygon points="${points(size / 2 + 3.6)}" fill="none" stroke="#050608" stroke-width="1.4"/>` +
    `<polygon points="${points(size / 2 + 1.6)}" fill="none" stroke="${colour}" stroke-width="2.8"/></svg>`;
  return {
    ...svgNode(`diamond ring ${size} ${colour}`, svg, whole),
    float: { to: 'parent', anchor: [0.5, 0.5], at: [0.5, 0.5] },
  };
}

/** The worn Art's bar to its next level, its words under it, and the emblem of the faction that raises it, its card
 *  naming the faction. */
function levelBlock(context: MenuContext, art: Art, look: ArtLook): Node {
  const { ui, sizes } = context;
  const standing = levelOf(context.gear.standing, art.id);
  const said = barWords(standing, art.id);
  const full = standing.level >= LEVEL_MOST || ready(standing);
  const share = full ? 1 : standing.xp / Math.max(1, standing.bar);
  const faction = factionOf(art.id);
  const sign = look.wide ? 48 : 24;
  if (faction)
    context.card(
      'arts-faction',
      () =>
        cardNode(
          {
            name: faction.name,
            rarity: 0,
            kind: 'Faction',
            big: null,
            rows: [],
            element: art.element,
            traits: [],
            words: `${faction.words} At their counter the ${art.name} Art rises a level, and its fragments are sold.`,
            compare: null,
          },
          null,
          [],
          sizes,
          { tone: look.tone },
        ),
      'arts-level',
    );
  return {
    id: 'arts-level',
    width: look.wide ? 352 : 264,
    direction: 'column',
    gap: 5,
    children: [
      {
        width: 'grow',
        padding: 1,
        outline: { width: 1, colour: INK.outline },
        children: [
          {
            id: 'arts-bar',
            width: 'grow',
            height: 8,
            padding: 1,
            fill: '#0b0d12',
            outline: { width: 1, colour: `rgba(${look.tone.rgb},0.55)` },
            label: `${art.name} XP: ${said}`,
            children: [
              {
                id: 'arts-bar-fill',
                width: `${Math.round(share * 1000) / 10}%`,
                height: 'grow',
                fill: full ? INK.brassLit : look.colour,
              },
            ],
          },
        ],
      },
      {
        width: 'grow',
        gap: 8,
        alignY: 'center',
        children: [
          { width: 'grow', children: [words(said, look.text, INK.word)] },
          faction && {
            id: 'arts-faction',
            focusable: true,
            label: faction.name,
            width: sign,
            height: sign,
            outline: { width: 1, colour: INK.outline },
            children: [
              emblemNode(emblemOf(faction.emblem), 'sign', 24, sign, sign),
              ui.focused('arts-faction') && ui.keyFocused && focusRing(sign, sign),
            ],
          },
        ],
      },
    ],
  };
}

/** The three Arts' diamonds, the worn one ringed in brass, each pressed to wear it; one not earned locked, refused
 *  before any ask. */
function picksNode(context: MenuContext, look: ArtLook, ask: ArtsState['ask']): Node {
  const { ui, sizes, gear } = context;
  const size = look.wide ? 72 : 48;
  return {
    id: 'arts-picks',
    gap: 11,
    label: 'Arts',
    children: ARTS.map((each): Node => {
      const id = `art-${each.id}`;
      // The Art shown is the first while none is worn, and none is marked worn.
      const worn = each.id === gear.arts?.art;
      const level = levelOf(gear.standing, each.id).level;
      const tone = lookOf(each, look.wide, look.short).tone;
      const earned = (earnedOf(gear.arts, each.id) & 1) !== 0;
      const lock = earned ? '' : `${earnedOn(each.id)}.`;
      if (ui.clicked(id) && !worn) {
        if (earned) ask({ kind: 'wearArt', art: each.id });
        else play('refused');
      }
      const card = artCard(each, worn, level);
      context.card(
        id,
        () =>
          cardNode(
            earned ? card : { ...card, kind: 'Art, not earned', words: `${card.words} ${lock}` },
            null,
            worn || !earned ? [] : [['Click', 'Wear it']],
            sizes,
            { tone, icon: svgNode(`art ${each.id}`, emblemSvg(each), 72) },
          ),
        'arts-picks',
      );
      const lit = earned && (worn || ui.hovered(id));
      return {
        id,
        press: true,
        label: `${each.name}, level ${level}${worn ? ', worn' : ''}${earned ? '' : `, not earned. ${lock}`}`,
        direction: 'column',
        alignX: 'center',
        gap: 5,
        children: [
          {
            width: size,
            height: size,
            picture: {
              key: `art ${each.id}`,
              source: { svg: emblemSvg(each) },
              // The others stand a little subdued, one not earned dark under its padlock.
              ...(!lit && { tint: earned ? 'rgb(204,204,204)' : 'rgb(110,110,110)' }),
            },
            children: [
              worn && diamondRing(size, INK.brassLit),
              ui.focused(id) && ui.keyFocused && diamondRing(size, '#f2efe6'),
              !earned && {
                ...svgNode(`lock ${each.element}`, mapSvg(LOCK_MAP, each.element), 20, 24),
                float: { to: 'parent', anchor: [0.5, 0.5], at: [0.5, 0.5] },
              },
            ],
          },
          pipsNode(level, each.element, look.wide ? 7 : 5, look.wide ? 5 : 3),
        ],
      };
    }),
  };
}

/** The worn Art's name and level, element, framed diamond opening from its middle, the three Arts and its words. */
function sideOf(context: MenuContext, art: Art, look: ArtLook, ask: ArtsState['ask']): Node {
  const standing = levelOf(context.gear.standing, art.id);
  const { cell } = look;
  const emblemAge = context.ui.age(`arts-emblem-${art.key}`);
  // The emblem opens from its middle in six steps, as the screen opens or another Art is worn.
  const grown = motionReduced() ? 1 : stepped(emblemAge, 0.24, 6);
  const emblemSize = Math.max(0, Math.round(24 * cell * grown));
  const element = ELEMENTS[art.element];
  return {
    width: look.wide ? 352 : 264,
    direction: 'column',
    alignX: 'center',
    gap: look.short ? 8 : 11,
    children: [
      {
        gap: 11,
        alignY: 'center',
        children: [
          {
            id: 'arts-name',
            text: {
              words: art.name.toUpperCase(),
              size: look.wide ? 4 : 3,
              colour: INK.word,
              tracking: look.wide ? 3 : 5,
              wrap: false,
            },
          },
          pipsNode(standing.level, art.element, look.wide ? 11 : 8, look.wide ? 8 : 5),
        ],
      },
      {
        gap: 5,
        alignY: 'center',
        children: [
          elementNode(art.element, look.text > 1 ? 22 : 16),
          {
            text: {
              words: `${element?.name ?? ''} Art · ${shareWords(standing.level)}`.toUpperCase(),
              size: look.text,
              colour: look.tone.lit,
              tracking: 3,
              wrap: false,
            },
          },
        ],
      },
      {
        width: 32 * cell,
        height: 32 * cell,
        alignX: 'center',
        alignY: 'center',
        picture: { key: `art frame ${art.id}`, source: { svg: frameSvg(art) } },
        children: [
          {
            id: `arts-emblem-${art.key}`,
            width: emblemSize,
            height: emblemSize,
            ...(emblemSize > 0 && { picture: { key: `art ${art.id}`, source: { svg: emblemSvg(art) } } }),
          },
        ],
      },
      picksNode(context, look, ask),
      levelBlock(context, art, look),
      {
        // Two lines' room, so changing Art never moves what stands above or beside it.
        width: look.wide ? 352 : 264,
        minHeight: look.wide ? 56 : 28,
        text: { words: art.blurb, size: look.text, colour: INK.faint, align: 'center' },
      },
    ],
  };
}

/** The Art's screen for the worn Art. */
export function artsPage(context: MenuContext, state: ArtsState): Node {
  const { ui, gear, room } = context;
  const worn = gear.arts;
  const art = (worn && artOf(worn.art)) ?? ARTS[0];
  if (!art || !worn) return { width: 'grow' };
  const view = ui.size;
  const look = lookOf(art, context.sizes.label > 1, context.sizes.short, view);
  const still = motionReduced();
  const opened = ui.age(PAGE);
  const emblemAge = ui.age(`arts-emblem-${art.key}`);
  // Another Art worn since the screen opened: the screen flashes in its colour, five steps fading.
  const flash = !still && opened - emblemAge > 0.05 && emblemAge < 0.3 ? 0.35 * (1 - stepped(emblemAge, 0.3, 5)) : 0;
  const [top, side, bottom] = look.padding;
  const cell = look.wide ? 6 : 4;
  const [cols, rows] = [Math.ceil(room.width / cell), Math.ceil(room.height / cell)];
  const line = ui.boxOf('arts-line');
  const own = ui.boxOf(PAGE);
  const focus = focusOf(cols, cols * cell, line && own ? line.x + line.width - own.x : null);
  const scene = artStage(art, cols, rows, focus, performance.now(), still);
  const fade = still ? 1 : stepped(opened, 0.24, 4);
  const page: Node = {
    id: PAGE,
    width: room.width,
    height: room.height,
    clip: true,
    fill: INK.ground,
    label: art.name,
    picture: look.ground,
    children: [
      {
        width: cols * cell,
        height: rows * cell,
        ...(scene && { picture: fade < 1 ? { ...scene, tint: `rgba(255,255,255,${fade})` } : scene }),
        // The scene fills the stage; the screen's own room stands inside its padding, over it.
        children: [
          {
            width: room.width,
            height: room.height,
            padding: [top, side, bottom, side],
            gap: 44,
            children: [sideOf(context, art, look, state.ask), artsRows(context, art, look, state, opened)],
          },
        ],
      },
      flash > 0 && {
        width: 'grow',
        height: 'grow',
        through: true,
        fill: `rgba(${look.tone.rgb},${flash})`,
        float: { to: 'parent', z: 30 },
      },
    ],
  };
  return page;
}
