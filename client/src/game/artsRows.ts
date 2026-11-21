// The Art's screen's rows (artsPage.ts): its ANIMA and its two TENETS on one line, each spell's tile with its key on a
// keycap under it, the Anima breathing, one its road has not earned locked; its CORE under them, three slots, the open
// one's flyout of the Art's six fragments beside them (one set in another slot, or not owned, refused before any ask),
// and the fragments set written out under the slots; and while its road's fragment choice waits, the fragments not
// owned to choose from. A slot the room has just set flares. The screen's look in the worn Art's element is here too.

import { earnedOf } from '../network/artMessages.ts';
import { motionReduced } from '../plus/kit.ts';
import { earnedOn } from '../player/factionNames.ts';
import { ELEMENTS, answerText } from '../player/gear.ts';
import { LOCK_MAP, mapSvg } from '../player/artGlyphs.ts';
import { announce } from '../ui/announce.ts';
import type { Child, Node, Picture } from '../ui/node.ts';
import {
  CORE_SLOTS,
  type Art,
  type Spell,
  coreChoices,
  coreOf,
  coresOf,
  fragmentCard,
  fragmentSvg,
  heldOf,
  keyOf,
  slotCard,
  spellCard,
  spellNumbers,
  spellSvg,
} from './artsCards.ts';
import { LEVEL_MOST, fragmentWords, howHad, levelOf, owns, ownedCount } from './artLevels.ts';
import type { ArtsState } from './artsPage.ts';
import { type Tone, cardNode, elementTone } from './gearCard.ts';
import {
  type Hint,
  INK,
  type TileTone,
  focusRing,
  glyphNode,
  keycap,
  label,
  svgNode,
  tileNode,
  words,
} from './gearNodes.ts';
import type { MenuContext } from './menuPage.ts';
import { chime, play } from './uiSounds.ts';

/** What the footer says the screen's presses and keys do. */
export const ARTS_HINTS: readonly Hint[] = [
  ['Click', 'Wear an Art or set a fragment'],
  ['Arrows', 'Move'],
  ['Enter', 'Choose'],
  ['Esc', 'Back'],
];
/** What a card's foot says its tile's press does. */
const CHANGE: readonly Hint[] = [['Click', 'Change it']];
const CHOOSE: readonly Hint[] = [['Click', 'Choose a fragment']];
const SET: readonly Hint[] = [['Click', 'Set it here']];
const TAKE: readonly Hint[] = [['Click', 'Choose it']];
/** A cell's tile and its picture, a slot's on a short screen and elsewhere, in pixels. */
const CELL = 64;
const CELL_PX = 48;
const SLOT_SHORT = 77;
const SLOT = 88;
const SLOT_PX = 72;
/** Where the menu keeps the words a refused fragment said, between frames. */
const REFUSAL = 'arts-refusal';

/** The key of a spell's tile, which the screen's focus starts on for the Anima. */
export const spellKey = (spell: Spell): string => `spell-${spell.key}`;

/** The screen's look for an Art on this view: its tone, its colour, its words' step, whether it is wide or short, the
 *  emblem's cell, the padding round it, and its ground lit in the Art's colour. */
export interface ArtLook {
  readonly tone: Tone & TileTone;
  readonly colour: string;
  readonly text: number;
  readonly wide: boolean;
  readonly short: boolean;
  readonly cell: number;
  readonly padding: readonly [number, number, number];
  readonly ground: Picture;
}

/** The look of `art` on a view `wide` (the menu's labels a step larger) or `short`, `view` CSS pixels. */
export function lookOf(
  art: Art,
  wide: boolean,
  short: boolean,
  view: { readonly width: number; readonly height: number } = { width: 1280, height: 900 },
): ArtLook {
  const colour = ELEMENTS[art.element]?.colour ?? INK.brass;
  const tone = { ...elementTone(art.element), colour };
  const middling = view.width >= 1500 && view.height >= 900 && view.height < 1000;
  // The emblem's cell: a step less where short, more where wide.
  const cell = view.height <= 800 ? 6 : wide ? (middling ? 10 : 11) : short ? 7 : 8;
  const top = wide ? (middling ? 44 : 88) : short ? 33 : 66;
  const rgb = tone.rgb;
  return {
    tone,
    colour,
    text: wide ? 2 : 1,
    wide,
    short,
    cell,
    padding: [top, wide ? 88 : 44, wide ? 33 : 22],
    ground: {
      key: `arts ground ${rgb}`,
      source: {
        draw: (drawing, width, height) => {
          // Lit in the Art's colour, strongest at the right where its scene stands, darkened top and foot.
          const glow = (x: number, y: number, across: number, down: number, alpha: number, reach: number) => {
            drawing.save();
            drawing.translate(x * width, y * height);
            drawing.scale(1, (down * height) / (across * width));
            const light = drawing.createRadialGradient(0, 0, 0, 0, 0, across * width);
            light.addColorStop(0, `rgba(${rgb},${alpha})`);
            light.addColorStop(reach, `rgba(${rgb},0)`);
            drawing.fillStyle = light;
            drawing.fillRect(-across * width, -across * width, 2 * across * width, 2 * across * width);
            drawing.restore();
          };
          glow(0.8, 0.5, 0.55, 0.9, 0.32, 0.7);
          glow(0.16, 0.46, 0.36, 0.64, 0.2, 0.72);
          const band = drawing.createLinearGradient(0, 0, 0, height);
          band.addColorStop(0, 'rgba(5,6,8,0.6)');
          band.addColorStop(0.22, 'rgba(5,6,8,0)');
          band.addColorStop(0.78, 'rgba(5,6,8,0)');
          band.addColorStop(1, 'rgba(5,6,8,0.6)');
          drawing.fillStyle = band;
          drawing.fillRect(0, 0, width, height);
        },
      },
    },
  };
}

/** How far a stepped animation of `steps` steps over `seconds` has come `age` seconds in, as CSS's `steps(n, end)`. */
export const stepped = (age: number, seconds: number, steps: number): number =>
  Math.min(1, Math.floor((Math.max(0, age) / seconds) * steps) / steps);

/** An Art's level as five pips `pip` pixels a side `gap` apart, lit up to it in its element. */
export function pipsNode(level: number, element: number, pip: number, gap: number): Node {
  const found = ELEMENTS[element];
  const [lit, fill] = [found?.palette[2] ?? INK.brassLit, found?.colour ?? INK.brass];
  const rgb = elementTone(element).rgb;
  // Each pip a square turned on its corner, its corners reaching past its box.
  const reach = pip * 0.707;
  const step = pip + gap;
  const [width, height] = [Math.ceil(4 * step + pip + 2 * reach - pip + 2), Math.ceil(2 * reach + 2)];
  const shapes = Array.from({ length: LEVEL_MOST }, (_unused, place) => {
    const [x, y] = [1 + reach + place * step, height / 2];
    const shines = place < level;
    const points = `${x},${y - reach} ${x + reach},${y} ${x},${y + reach} ${x - reach},${y}`;
    return `<polygon points="${points}" fill="${shines ? fill : '#0b0d12'}" stroke="${shines ? lit : `rgba(${rgb},0.6)`}" stroke-width="1"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${shapes.join('')}</svg>`;
  return { ...svgNode(`pips ${level} ${element} ${pip}`, svg, width, height), label: `Level ${level}` };
}

/** A row's heading over its rule, tinted in the element and ticked at its end. */
function heading(said: string, look: ArtLook, width: number | 'grow'): Node {
  const rule = `rgba(${look.tone.rgb},0.45)`;
  return {
    width,
    direction: 'column',
    gap: 4,
    padding: [4, 0, 8, 0],
    children: [
      label(said, look.text),
      {
        width: 'grow',
        height: 1,
        fill: rule,
        children: [
          {
            width: 2,
            height: 5,
            fill: `rgba(${look.tone.rgb},0.9)`,
            float: { to: 'parent', anchor: [1, 0], at: [1, 0], y: -2 },
          },
        ],
      },
    ],
  };
}

/** Whether `id` stands lit: under the pointer, or given the focus by the keys. */
const litOf = (context: MenuContext, id: string) =>
  context.ui.hovered(id) || (context.ui.focused(id) && context.ui.keyFocused);

/** A padlock in the corner of a tile not to be had yet, in the Art's element. */
const lockMark = (art: Art): Node => ({
  ...svgNode(`lock ${art.element}`, mapSvg(LOCK_MAP, art.element), 20, 24),
  float: { to: 'parent', clipped: true, anchor: [1, 1], at: [1, 1], x: -3, y: -3 },
});

/** A spell's tile: its icon and its key on a keycap under it. It is pressed for nothing; its card shows beside the
 *  spells' line on hover or focus. The Anima's breathes in its element; one its road has not earned stands dim under
 *  a padlock, its card saying which road earns it. */
function spellTile(context: MenuContext, art: Art, spell: Spell, look: ArtLook): Node {
  const { ui, sizes, gear } = context;
  const anima = spell === art.anima;
  const key = keyOf(art, spell);
  const id = spellKey(spell);
  const level = levelOf(gear.standing, art.id).level;
  const bit = anima ? 1 : 2 << art.tenets.indexOf(spell);
  const lock = (earnedOf(gear.arts, art.id) & bit) === 0 ? `${earnedOn(art.id)}.` : null;
  context.card(
    id,
    () => {
      const core = coreOf(gear.arts ? coresOf(gear.arts) : {}, art.id);
      // Below the highest level, what the spell holds there, muted under its numbers.
      const held = heldOf(art, core);
      const now = spellNumbers(spell, level, held);
      const most = spellNumbers(spell, LEVEL_MOST, held).filter(([, value], place) => value !== now[place]?.[1]);
      const said = most.map(([name, value]) => `${name} ${value}`).join(' · ');
      const card = spellCard(art, spell, level, core);
      const shown = lock ? { ...card, kind: `${card.kind}, not earned`, words: `${card.words} ${lock}` } : card;
      return cardNode(shown, null, lock ? [] : [[key, 'Cast in play']], sizes, {
        tone: look.tone,
        icon: svgNode(`spell ${art.key} ${spell.key}`, spellSvg(art, spell), 72),
        after: [
          most.length > 0 && {
            width: 'grow',
            padding: [5, 0, 0, 0],
            text: { words: `At level ${LEVEL_MOST}: ${said}`, size: sizes.label, colour: INK.faint },
          },
        ],
      });
    },
    'arts-line',
  );
  const size = anima ? (sizes.short ? SLOT_SHORT : SLOT) : CELL;
  const picture = anima ? SLOT_PX : CELL_PX;
  // The Anima breathes in its element: its glow swells and settles in six steps each way.
  const breath = anima && !motionReduced() ? stepped((ui.age(id) / 2.4) % 1, 1, 6) : 0;
  const swelling = Math.floor(ui.age(id) / 2.4) % 2 === 0 ? breath : 1 - breath;
  return tileNode(
    size,
    null,
    litOf(context, id) ? 'lit' : 'rest',
    [
      {
        ...svgNode(`spell ${art.key} ${spell.key}`, spellSvg(art, spell), picture),
        ...(lock ? { opacity: 0.35 } : {}),
      },
    ],
    {
      id,
      focusable: true,
      label: `${spell.name}, ${anima ? 'Anima' : 'Tenet'}, key ${key}${lock ? `, not earned. ${lock}` : ''}`,
      toned: look.tone,
      marks: [
        lock !== null && lockMark(art),
        anima && {
          width: size + 4,
          height: size + 4,
          float: { to: 'parent', clipped: true, x: -2, y: -2 },
          outline: { width: 2, colour: `rgba(${look.tone.rgb},${0.25 + 0.35 * swelling})` },
        },
        {
          ...keycap(key, look.text),
          float: { to: 'parent', anchor: [0.5, 0], at: [0.5, 1], y: look.wide ? -14 : -11 },
        },
        ui.focused(id) && ui.keyFocused && focusRing(size, size),
      ],
    },
  );
}

/** A row's heading over its tiles, at least 220 pixels wide (330 where wide). */
function group(said: string, look: ArtLook, tiles: readonly Child[], id: string, rise: number): Node {
  return {
    id,
    direction: 'column',
    minWidth: look.wide ? 330 : 220,
    opacity: rise,
    offset: [0, Math.round(8 * (1 - rise))],
    children: [heading(said, look, 'grow'), { gap: 11, alignY: 'end', children: tiles }],
  };
}

/** The Core's slots and, while one is open, its flyout of the Art's six fragments; what is set written out under. */
function coreRow(context: MenuContext, art: Art, look: ArtLook, state: ArtsState, rise: number, opened: number): Node {
  const { ui, gear, sizes } = context;
  const { open, choose } = state;
  const core = coreOf(gear.arts ? coresOf(gear.arts) : {}, art.id);
  const standing = levelOf(gear.standing, art.id);
  const owned = (fragment: Parameters<typeof owns>[1]) => owns(standing, fragment);
  const slots = core.map((chosen, slot): Node => {
    const id = `core-${slot}`;
    const fragment = chosen === null ? undefined : art.core[chosen];
    if (ui.clicked(id)) {
      ui.store.set(REFUSAL, '');
      choose(open === slot ? null : slot);
      // Into the flyout, at the fragment set here, else the first that may be.
      if (open !== slot) {
        const first = chosen ?? coreChoices(art, core, slot, owned).find((each) => each.ask)?.index ?? 0;
        state.focus(`fragment-${first}`);
      }
    }
    context.card(
      id,
      () =>
        fragment
          ? cardNode(fragmentCard(art, fragment, null, standing.level, null, core), null, CHANGE, sizes, {
              tone: look.tone,
              icon: svgNode(`fragment ${art.key} ${fragment.key}`, fragmentSvg(art, fragment), 72),
            })
          : cardNode(slotCard(art, slot), null, CHOOSE, sizes, { tone: look.tone }),
      'arts-core-tiles',
    );
    // A slot the room has just set flares: the id of its mark is new as the fragment in it changes, so its age is how
    // long it has stood; one there as the screen opened, or as the Art was worn, does not.
    const flareId = `core-flare-${art.key}-${slot}-${chosen}`;
    const flareAge = ui.age(flareId);
    const fresh = chosen !== null && opened - flareAge > 0.05 && ui.age(`arts-emblem-${art.key}`) - flareAge > 0.05;
    if (fresh && flareAge === 0) chime(0);
    const flare = fresh && !motionReduced() && flareAge < 0.36 ? 1 - stepped(flareAge, 0.36, 6) : 0;
    const shown = open === slot || state.pending === slot;
    return tileNode(
      CELL,
      null,
      shown ? 'open' : litOf(context, id) ? 'lit' : 'rest',
      [
        fragment
          ? svgNode(`fragment ${art.key} ${fragment.key}`, fragmentSvg(art, fragment), CELL_PX)
          : { ...glyphNode('empty'), opacity: 0.6 },
      ],
      {
        id,
        press: true,
        label: `Core slot ${slot + 1}: ${fragment?.name ?? 'empty'}${state.pending === slot ? ', waiting' : ''}`,
        toned: look.tone,
        marks: [
          {
            id: flareId,
            width: 'grow',
            height: 'grow',
            float: { to: 'parent', clipped: true },
            ...(flare > 0 && { fill: `rgba(255,255,255,${0.35 * flare})`, outline: { width: 2, colour: '#f2efe6' } }),
          },
          ui.focused(id) && ui.keyFocused && focusRing(CELL, CELL),
        ],
      },
    );
  });
  const filled = core.filter((chosen) => chosen !== null).length;
  const set = core.flatMap((chosen) => {
    const fragment = chosen === null ? undefined : art.core[chosen];
    return fragment ? [fragment] : [];
  });
  return {
    id: 'arts-core',
    width: 'grow',
    direction: 'column',
    opacity: rise,
    offset: [0, Math.round(8 * (1 - rise))],
    children: [
      heading(`Core · ${filled} of ${CORE_SLOTS} · ${ownedCount(standing)} owned`, look, 'grow'),
      {
        id: 'arts-core-tiles',
        gap: 11,
        alignY: 'end',
        children: [...slots, open !== null && flyoutNode(context, art, look, state, core, open)],
      },
      set.length > 0 && {
        width: 'grow',
        direction: 'column',
        gap: 5,
        padding: [22, 0, 0, 0],
        label: 'Set in the Core',
        children: set.map((fragment): Node => ({
          width: 'grow',
          text: {
            words: [
              { words: `${fragment.name}  `, colour: look.tone.lit },
              { words: fragmentWords(fragment, standing.level), colour: INK.faint },
            ],
            size: look.text,
          },
        })),
      },
    ],
  };
}

/** The open Core slot's flyout: the Art's six fragments, each set here by a click; one set in another slot, or not
 *  owned, refused before any ask, the refusal said under them. */
function flyoutNode(
  context: MenuContext,
  art: Art,
  look: ArtLook,
  state: ArtsState,
  core: readonly (number | null)[],
  open: number,
): Node {
  const { ui, gear, sizes } = context;
  const standing = levelOf(gear.standing, art.id);
  const choices = coreChoices(art, core, open, (fragment) => owns(standing, fragment));
  const cells = choices.map((choice): Node => {
    const { fragment, setIn, ask, owned } = choice;
    const id = `fragment-${choice.index}`;
    const taken = setIn !== null && setIn !== open;
    const said =
      setIn === null ? (owned ? '' : ', not owned') : setIn === open ? ', set here' : `, set in slot ${setIn + 1}`;
    if (ui.clicked(id)) {
      if (taken) {
        ui.store.set(REFUSAL, '');
        play('refused');
      } else if (!owned) {
        ui.store.set(REFUSAL, answerText(114));
        announce(answerText(114));
        play('refused');
      } else {
        ui.store.set(REFUSAL, '');
        if (ask) state.ask(ask);
        state.choose(null);
        state.focus(`core-${open}`);
      }
    }
    // Its numbers with the Core as choosing it would leave it.
    const chosenCore = core.map((each, slot) => (slot === open ? choice.index : each));
    context.card(
      id,
      () =>
        cardNode(
          fragmentCard(art, fragment, setIn, standing.level, owned ? null : howHad(art.id), chosenCore),
          null,
          ask ? SET : [],
          sizes,
          { tone: look.tone, icon: svgNode(`fragment ${art.key} ${fragment.key}`, fragmentSvg(art, fragment), 72) },
        ),
      'arts-flyout',
    );
    const picture: Node = {
      width: CELL_PX,
      height: CELL_PX,
      // One not owned stands dim and greyed under its padlock.
      ...(!owned && { opacity: 0.35 }),
      picture: {
        key: `fragment ${art.key} ${fragment.key}`,
        source: { svg: fragmentSvg(art, fragment) },
        ...(!owned && { tint: 'rgb(150,150,150)' }),
      },
    };
    return tileNode(CELL, null, setIn === open ? 'open' : litOf(context, id) ? 'lit' : 'rest', [picture], {
      id,
      press: true,
      label: `${fragment.name}${said}`,
      toned: look.tone,
      ...(taken && { opacity: 0.4 }),
      marks: [
        taken && {
          text: { words: String(setIn + 1), colour: INK.word, edge: 'halo', edgeColour: INK.outline },
          float: { to: 'parent', clipped: true, anchor: [1, 1], at: [1, 1], x: -4, y: -5 },
        },
        !owned && lockMark(art),
        ui.focused(id) && ui.keyFocused && focusRing(CELL, CELL),
      ],
    });
  });
  const refusal = ui.store.get(REFUSAL);
  return {
    id: 'arts-flyout',
    role: 'panel',
    fill: INK.ground,
    padding: 10,
    direction: 'column',
    gap: 8,
    solid: true,
    float: { to: 'parent', anchor: [0, 0], at: [1, 0], x: 11, y: -11, z: 26 },
    children: [
      label(`Core slot ${open + 1}`, look.text),
      {
        direction: 'column',
        gap: 6,
        children: [0, 1].map((row) => ({ gap: 6, children: cells.slice(row * 3, row * 3 + 3) })),
      },
      { minHeight: 16, children: [typeof refusal === 'string' && refusal !== '' && words(refusal, 1, INK.word)] },
    ],
  };
}

/** The fragments its road's choice may take, while one waits for the Art: each not owned, chosen by a click (an ask
 *  the room answers, owning it); none while no choice waits. */
function choiceRow(context: MenuContext, art: Art, look: ArtLook, state: ArtsState, rise: number): Node | null {
  const { ui, gear, sizes } = context;
  const waiting = gear.quest?.choices[art.id - 1] ?? 0;
  if (waiting === 0) return null;
  const standing = levelOf(gear.standing, art.id);
  const tiles = art.core.flatMap((fragment, index): Node[] => {
    if (owns(standing, index)) return [];
    const id = `choose-${index}`;
    if (ui.clicked(id)) state.ask({ kind: 'chooseFragment', art: art.id, fragment: index });
    const icon = () => svgNode(`fragment ${art.key} ${fragment.key}`, fragmentSvg(art, fragment), CELL_PX);
    context.card(
      id,
      () =>
        cardNode(fragmentCard(art, fragment, null, standing.level), null, TAKE, sizes, {
          tone: look.tone,
          icon: icon(),
        }),
      'arts-choice',
    );
    return [
      tileNode(CELL, null, litOf(context, id) ? 'lit' : 'rest', [icon()], {
        id,
        press: true,
        label: `${fragment.name}, choose it`,
        toned: look.tone,
        marks: [ui.focused(id) && ui.keyFocused && focusRing(CELL, CELL)],
      }),
    ];
  });
  return {
    id: 'arts-choice',
    width: 'grow',
    direction: 'column',
    opacity: rise,
    offset: [0, Math.round(8 * (1 - rise))],
    children: [
      heading(`Choose a fragment · ${waiting} waiting`, look, 'grow'),
      { gap: 11, wrap: true, children: tiles },
    ],
  };
}

/** The screen's rows: the Anima and the Tenets on one line, the Core under them as wide, each rising in as it opens. */
export function artsRows(context: MenuContext, art: Art, look: ArtLook, state: ArtsState, opened: number): Node {
  const still = motionReduced();
  // Each group rises in four steps, one after another, as the screen opens.
  const rise = (delay: number) => (still ? 1 : stepped(opened - delay, 0.16, 4));
  // As wide as the spells' line, so the Core's written fragments wrap within it and give it no width.
  const line = context.ui.boxOf('arts-line');
  return {
    width: line ? Math.max(line.width, 220) : 'fit',
    direction: 'column',
    gap: 22,
    children: [
      {
        id: 'arts-line',
        gap: 44,
        wrap: true,
        children: [
          group('Anima', look, [spellTile(context, art, art.anima, look)], 'arts-anima', rise(0.08)),
          group(
            'Tenets',
            look,
            art.tenets.map((tenet) => spellTile(context, art, tenet, look)),
            'arts-tenets',
            rise(0.12),
          ),
        ],
      },
      coreRow(context, art, look, state, rise(0.16), opened),
      choiceRow(context, art, look, state, rise(0.2)),
    ],
  };
}
